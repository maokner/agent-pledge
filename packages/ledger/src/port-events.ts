/**
 * Turns this package's global `tx.*` events into the contract's TxEvents, for one port only.
 *
 * Every port method runs its ops inside a call scope (AsyncLocalStorage). submitTx emits `tx.pending`
 * synchronously inside the op's async context, so the listener sees which call (if any) submitted
 * the transaction. Transactions submitted outside a scope of this forwarder, for example by another
 * port or a script in the same process, are ignored. Later events of a transaction (validated,
 * failed) are matched by hash.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Money, TxEvent, TxKind as ContractTxKind, TxListener } from "@agent-pledge/shared";
import { ledgerEvents, type LedgerEventEmitter } from "./events.js";
import { boardMemo, toContractError } from "./port-map.js";
import type { LedgerTxEventBase } from "./shared-types.js";

/** The contract fields of one transaction, known when it is submitted. */
export interface EventInfo {
  kind: ContractTxKind;
  taskId?: string | undefined;
  subtaskId?: string | undefined;
  amount?: Money | undefined;
  from?: string | undefined;
  to?: string | undefined;
  memo?: string | undefined;
  nftId?: string | undefined;
  offerId?: string | undefined;
}

export interface ScopeSpec {
  /** Contract fields for a transaction this call submits. Undefined drops (does not forward) it. */
  describe(event: LedgerTxEventBase): EventInfo | undefined;
  /**
   * Hold the validated event until the call resolves, so it can carry the NFT ID or offer ID that
   * only the validated metadata has. Use it for calls that submit one transaction.
   */
  deferValidated?: boolean;
}

interface CallScope extends ScopeSpec {
  held: string[];
}

/** Drops undefined fields, so a spread does not overwrite known values with undefined. */
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export class TxForwarder {
  private readonly als = new AsyncLocalStorage<CallScope>();
  private readonly listeners = new Set<TxListener>();
  /** The last event of each forwarded transaction that is not final yet, by hash. */
  private readonly open = new Map<string, TxEvent>();
  private readonly detach: () => void;

  constructor(
    private readonly explorerTxUrl: (hash: string) => string,
    source: LedgerEventEmitter = ledgerEvents,
  ) {
    const offs = [
      source.on("tx.pending", (e) => this.onPending(e)),
      source.on("tx.validated", (e) => this.onValidated(e.hash)),
      source.on("tx.failed", (e) => this.onFailed(e.hash, e.code)),
    ];
    this.detach = () => offs.forEach((off) => off());
  }

  onTx(listener: TxListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Sends an event to every listener. A listener that throws does not stop the others. */
  emit(event: TxEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener({ ...event });
      } catch (error) {
        console.error("[ledger port] TxEvent listener threw", error);
      }
    }
  }

  /** Builds a TxEvent from contract fields. */
  event(hash: string, status: TxEvent["status"], info: EventInfo): TxEvent {
    const memo = info.memo ?? boardMemo(info);
    return {
      ...defined(info),
      kind: info.kind,
      hash,
      status,
      ...(info.amount !== undefined ? { currency: "RLUSD" as const } : {}),
      ...(memo !== undefined ? { memo } : {}),
      explorerUrl: this.explorerTxUrl(hash),
    };
  }

  /**
   * Runs `fn` in a call scope: its transactions reach onTx listeners. `extras` adds fields from the
   * result (NFT ID, offer ID) to held validated events. Errors become the contract's typed errors.
   */
  async run<T>(
    spec: ScopeSpec,
    fn: () => Promise<T>,
    extras?: (result: T) => Partial<EventInfo>,
  ): Promise<T> {
    const scope: CallScope = { ...spec, held: [] };
    let result: T;
    try {
      result = await this.als.run(scope, fn);
    } catch (error) {
      this.flush(scope, {});
      throw toContractError(error);
    }
    this.flush(scope, extras ? extras(result) : {});
    return result;
  }

  close(): void {
    this.detach();
    this.listeners.clear();
    this.open.clear();
  }

  private flush(scope: CallScope, extra: Partial<EventInfo>): void {
    for (const hash of scope.held.splice(0)) {
      const base = this.open.get(hash);
      if (!base) continue;
      this.open.delete(hash);
      this.emit({ ...base, ...defined(extra), status: "validated" });
    }
  }

  private onPending(e: LedgerTxEventBase): void {
    const scope = this.als.getStore();
    if (!scope) return;
    const info = scope.describe(e);
    if (!info) return;
    const event = this.event(e.hash, "pending", info);
    this.open.set(e.hash, event);
    this.emit(event);
  }

  private onValidated(hash: string): void {
    const base = this.open.get(hash);
    if (!base) return;
    const scope = this.als.getStore();
    if (scope?.deferValidated) {
      scope.held.push(hash);
      return;
    }
    this.open.delete(hash);
    this.emit({ ...base, status: "validated" });
  }

  private onFailed(hash: string, code: string): void {
    const base = this.open.get(hash);
    if (!base) return;
    this.open.delete(hash);
    this.emit({ ...base, status: "failed", error: code });
  }
}
