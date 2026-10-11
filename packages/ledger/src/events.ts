import type { LedgerEventMap, LedgerEventName } from "@agent-pledge/shared";

export type LedgerEventListener<E extends LedgerEventName> = (payload: LedgerEventMap[E]) => void;

/**
 * A small typed event emitter. A listener that throws does not stop the other listeners and never
 * breaks the ledger call that emitted the event; the error goes to `onListenerError`.
 */
export class LedgerEventEmitter {
  private readonly listeners = new Map<LedgerEventName, Set<LedgerEventListener<never>>>();

  constructor(
    private readonly onListenerError: (error: unknown, event: LedgerEventName) => void = (
      error,
      event,
    ) => console.error(`[ledger] listener for ${event} threw`, error),
  ) {}

  /** Adds a listener. Returns a function that removes it. */
  on<E extends LedgerEventName>(event: E, listener: LedgerEventListener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as LedgerEventListener<never>);
    return () => this.off(event, listener);
  }

  /** Adds a listener that runs at most once. Returns a function that removes it. */
  once<E extends LedgerEventName>(event: E, listener: LedgerEventListener<E>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<E extends LedgerEventName>(event: E, listener: LedgerEventListener<E>): void {
    this.listeners.get(event)?.delete(listener as LedgerEventListener<never>);
  }

  emit<E extends LedgerEventName>(event: E, payload: LedgerEventMap[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as LedgerEventListener<E>)(payload);
      } catch (error) {
        this.onListenerError(error, event);
      }
    }
  }

  listenerCount(event: LedgerEventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  removeAllListeners(event?: LedgerEventName): void {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }
}

/**
 * The package-wide emitter. `submitTx` and the shared client emit on it.
 *
 * @example
 * ledgerEvents.on("tx.validated", (e) => board.send({ type: "tx", ...e }));
 */
export const ledgerEvents = new LedgerEventEmitter();
