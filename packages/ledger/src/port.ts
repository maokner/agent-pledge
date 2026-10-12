/**
 * createXrplLedger: the server's LedgerPort (packages/shared/src/ledger.ts) as a thin adapter over
 * the ops in src/ops. The ops do the ledger work; this file converts money, kinds, errors, and
 * events, and remembers the few IDs the contract does not pass back in (task NFT per task, task
 * per sub-task, NFT holders).
 */
import {
  LedgerNetworkError,
  LedgerTxFailedError,
  type AcceptTxResult,
  type CreatedWallet,
  type FailTaskInput,
  type LedgerPort,
  type Money,
  type NftTxResult,
  type OfferTxResult,
  type TxContext,
  type TxListener,
  type TxResult,
  type VerifiedTx,
  type VerifyTxExpect,
  type WalletRole,
  type XrplLedgerOptions,
} from "@agent-pledge/shared";
import { NFTokenCreateOfferFlags, RippledError, decode, type Amount, type Wallet } from "xrpl";
import { disconnect, getClient } from "./client.js";
import { isValidCurrencyCode, loadConfig, type LedgerConfig } from "./config.js";
import {
  explorerNftUrl as configExplorerNftUrl,
  explorerTxUrl as configExplorerTxUrl,
} from "./explorer.js";
import { readMemos, toHex } from "./memo.js";
import { addIouValues, compareIouValues, isZeroIouValue } from "./ops/amount.js";
import { acceptOffer } from "./ops/claim.js";
import type { OpsContext } from "./ops/context.js";
import {
  failTask,
  planFailTask,
  vaultStateFromHistory,
  type FailSubtaskInput,
} from "./ops/fail.js";
import { getAcceptedNftId, getCreatedOfferId } from "./ops/meta.js";
import { acceptPayoutOffer, burnNft, createPayoutOffer } from "./ops/payout.js";
import { findNftHolder, listCompleteAccountHistory, tokenValueOf } from "./ops/state.js";
import { mintSubtaskNft, offerSubtaskToAnyone } from "./ops/subtask.js";
import { fundTask, mintTaskNft, offerTaskToAgent } from "./ops/task.js";
import { transferToken } from "./ops/transfer.js";
import { TxForwarder, type EventInfo, type ScopeSpec } from "./port-events.js";
import { fromMoney, toContractError, toMoney, toMoneyOrUndefined } from "./port-map.js";
import { walletFromSeed, createWallet as createFundedWalletWithTrustLine } from "./wallet.js";

/** Parent NFT ID for a sub-task whose task NFT this process does not know (server restarted). */
export const UNKNOWN_PARENT_NFT_ID = "0".repeat(64);

/** How long verifyTx waits for an agent transaction to validate. */
const VERIFY_TIMEOUT_MS = 30_000;

/** The options every adapter shares. */
export interface NetworkOptions {
  networkUrl: string;
  rlusdIssuer: string;
  rlusdCurrency: string;
  explorerBaseUrl?: string | undefined;
}

/** "RLUSD" (or any 4 to 20 character code) as the 40 hex character code the XRPL needs. */
export function currencyCode(code: string): string {
  if (isValidCurrencyCode(code)) return code;
  if (/^[\x20-\x7E]{4,20}$/.test(code)) return toHex(code).padEnd(40, "0");
  return code; // loadConfig names the bad value
}

/** A LedgerConfig from the contract options only (not from process.env). */
export function configFromOptions(options: NetworkOptions): LedgerConfig {
  return loadConfig({
    XRPL_NETWORK_URL: options.networkUrl,
    XRPL_TOKEN_ISSUER: options.rlusdIssuer,
    XRPL_TOKEN_CURRENCY: currencyCode(options.rlusdCurrency),
    ...(options.explorerBaseUrl ? { XRPL_EXPLORER_URL: options.explorerBaseUrl } : {}),
  } as NodeJS.ProcessEnv);
}

/**
 * The ops type the task memo as required, but buildMemos leaves an undefined field out. When the
 * contract gives no task ID, leaving the memo out is better than writing a wrong one.
 */
export function memoTaskId(taskId: string | undefined): string {
  return taskId as string;
}

/** Runs `fn` and converts its errors to the contract's typed errors. */
export async function contractErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toContractError(error);
  }
}

/** One transaction per call: every event of the call gets `info`, validated waits for the result. */
export function single(info: EventInfo): ScopeSpec {
  return { describe: () => info, deferValidated: true };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function rippledErrorName(error: unknown): string | undefined {
  if (!(error instanceof RippledError)) return undefined;
  const data = error.data as { error?: unknown } | undefined;
  return typeof data?.error === "string" ? data.error : undefined;
}

/** The token value of an amount as a Money string, or undefined. */
function moneyOf(amount: Amount | undefined, config: LedgerConfig): Money | undefined {
  return toMoneyOrUndefined(tokenValueOf(amount, config));
}

function asAmount(value: unknown): Amount | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const { currency, issuer, value: v } = value as Record<string, unknown>;
    if (typeof currency === "string" && typeof issuer === "string" && typeof v === "string") {
      return { currency, issuer, value: v };
    }
  }
  return undefined;
}

/** The NFTokenOffer that an NFTokenAcceptOffer deleted (owner and amount of the accepted offer). */
function deletedOffer(meta: unknown): { owner?: string; amount?: Amount } {
  const nodes = (meta as { AffectedNodes?: unknown } | undefined)?.AffectedNodes;
  if (!Array.isArray(nodes)) return {};
  for (const node of nodes as Array<{ DeletedNode?: Record<string, unknown> }>) {
    const deleted = node.DeletedNode;
    if (deleted?.LedgerEntryType !== "NFTokenOffer") continue;
    const fields = (deleted.FinalFields ?? {}) as Record<string, unknown>;
    const amount = asAmount(fields.Amount);
    return {
      ...(typeof fields.Owner === "string" ? { owner: fields.Owner } : {}),
      ...(amount !== undefined ? { amount } : {}),
    };
  }
  return {};
}

export interface ValidatedTx {
  tx: Record<string, unknown>;
  meta: Record<string, unknown>;
}

/**
 * Polls the `tx` method until the transaction is in a validated ledger. Handles the API v2 shape
 * (`tx_json`) and the v1 shape (fields at the top level), and binary meta.
 * Throws LedgerNetworkError when it is not validated within `timeoutMs`.
 */
export async function fetchValidatedTx(
  c: OpsContext,
  hash: string,
  timeoutMs = VERIFY_TIMEOUT_MS,
): Promise<ValidatedTx> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await c.client.request({ command: "tx", transaction: hash });
      const result = response.result as unknown as Record<string, unknown> & {
        validated?: boolean;
        tx_json?: Record<string, unknown>;
        meta?: unknown;
      };
      if (result.validated) {
        const meta = typeof result.meta === "string" ? decode(result.meta) : result.meta;
        return {
          tx: result.tx_json ?? result,
          meta: (meta ?? {}) as Record<string, unknown>,
        };
      }
    } catch (error) {
      const name = rippledErrorName(error);
      if (name !== "txnNotFound") throw toContractError(error);
    }
    if (Date.now() >= deadline) {
      throw new LedgerNetworkError(
        `Transaction ${hash} is not in a validated ledger after ${Math.round(timeoutMs / 1000)} s`,
      );
    }
    await sleep(c.pollIntervalMs ?? 1_000);
  }
}

/** The NFTokenOffer ledger object for an offer index, from the validated ledger. */
export async function readOffer(
  c: OpsContext,
  offerId: string,
): Promise<{ nftId: string; owner: string; amount: Amount; destination?: string }> {
  let node: Record<string, unknown>;
  try {
    const response = await c.client.request({
      command: "ledger_entry",
      index: offerId,
      ledger_index: "validated",
    });
    node = (response.result as unknown as { node?: Record<string, unknown> }).node ?? {};
  } catch (error) {
    if (rippledErrorName(error) === "entryNotFound") {
      throw new LedgerTxFailedError(
        `Offer ${offerId} is not on the ledger (accepted, cancelled, or burned)`,
        "entryNotFound",
      );
    }
    throw toContractError(error);
  }
  const amount = asAmount(node.Amount);
  if (
    node.LedgerEntryType !== "NFTokenOffer" ||
    typeof node.NFTokenID !== "string" ||
    typeof node.Owner !== "string" ||
    amount === undefined
  ) {
    throw new LedgerTxFailedError(`Ledger object ${offerId} is not an NFT offer`, "mismatch");
  }
  return {
    nftId: node.NFTokenID,
    owner: node.Owner,
    amount,
    ...(typeof node.Destination === "string" ? { destination: node.Destination } : {}),
  };
}

export interface XrplLedgerPortOptions {
  /** Close the shared client in close(). False when the caller owns the client (tests). */
  ownsClient?: boolean;
  /** verifyTx timeout. Default 30 s. */
  verifyTimeoutMs?: number;
}

export class XrplLedgerPort implements LedgerPort {
  readonly vaultAddress: string;
  private readonly events: TxForwarder;
  /** Task NFT per task ID, from mintTaskNft and verified task claims. */
  private readonly taskNftByTask = new Map<string, string>();
  /** Parent task per sub-task ID, from verified sub-task fundings and calls with both IDs. */
  private readonly taskBySubtask = new Map<string, string>();
  /** Last known holder per NFT ID, for burns. */
  private readonly holderByNft = new Map<string, string>();
  /** Agent addresses seen in task offers and verified agent transactions. */
  private readonly agentAddresses = new Set<string>();
  private readonly failRuns = new Map<string, Promise<TxResult[]>>();

  constructor(
    private readonly c: OpsContext,
    private readonly vault: Wallet,
    private readonly treasury: Wallet,
    private readonly options: XrplLedgerPortOptions = {},
  ) {
    this.vaultAddress = vault.classicAddress;
    this.events = new TxForwarder((hash) => this.explorerTxUrl(hash));
  }

  onTx(listener: TxListener): () => void {
    return this.events.onTx(listener);
  }

  explorerTxUrl(hash: string): string {
    return configExplorerTxUrl(this.c.config, hash);
  }

  explorerNftUrl(nftId: string): string {
    return configExplorerNftUrl(this.c.config, nftId);
  }

  async close(): Promise<void> {
    this.events.close();
    if (this.options.ownsClient) await disconnect();
  }

  private result(hash: string, info: EventInfo): TxResult {
    return {
      hash,
      kind: info.kind,
      explorerUrl: this.explorerTxUrl(hash),
      ...(info.amount !== undefined ? { amount: info.amount } : {}),
      ...(info.from !== undefined ? { from: info.from } : {}),
      ...(info.to !== undefined ? { to: info.to } : {}),
    };
  }

  private remember(ctx: TxContext): void {
    if (ctx.subtaskId && ctx.taskId) this.taskBySubtask.set(ctx.subtaskId, ctx.taskId);
  }

  private taskOf(ctx: TxContext): string | undefined {
    return ctx.taskId ?? (ctx.subtaskId ? this.taskBySubtask.get(ctx.subtaskId) : undefined);
  }

  // ---------- wallets and funding ----------

  createWallet(role: Extract<WalletRole, "requester" | "helper">): Promise<CreatedWallet> {
    return this.events.run(
      {
        describe: (e) =>
          e.txType === "TrustSet" ? { kind: "wallet_setup", to: e.account } : undefined,
      },
      async () => {
        const wallet = await createFundedWalletWithTrustLine(this.c.client, this.c.config);
        return { role, address: wallet.address, seed: wallet.seed };
      },
    );
  }

  async fundRequester(address: string, amount: Money, ctx?: TxContext): Promise<TxResult> {
    const info: EventInfo = {
      kind: "requester_funding",
      taskId: ctx?.taskId,
      subtaskId: ctx?.subtaskId,
      amount: toMoney(fromMoney(amount)),
      from: this.treasury.classicAddress,
      to: address,
    };
    const tx = await this.events.run(single(info), () =>
      transferToken(
        { from: this.treasury, to: address, amount: fromMoney(amount), taskId: ctx?.taskId },
        this.c,
      ),
    );
    return this.result(tx.hash, info);
  }

  async fundTask(requesterSeed: string, taskId: string, amount: Money): Promise<TxResult> {
    const requester = walletFromSeed(requesterSeed);
    const info: EventInfo = {
      kind: "task_funding",
      taskId,
      amount: toMoney(fromMoney(amount)),
      from: requester.classicAddress,
      to: this.vaultAddress,
    };
    const tx = await this.events.run(single(info), () =>
      fundTask({ requester, vault: this.vaultAddress, amount: fromMoney(amount), taskId }, this.c),
    );
    return this.result(tx.hash, info);
  }

  // ---------- task NFT ----------

  async mintTaskNft(taskId: string, uri: string): Promise<NftTxResult> {
    const info: EventInfo = { kind: "task_nft_mint", taskId, from: this.vaultAddress };
    const mint = await this.events.run(
      single(info),
      () => mintTaskNft({ vault: this.vault, uri, taskId }, this.c),
      (r) => ({ nftId: r.nftId }),
    );
    this.taskNftByTask.set(taskId, mint.nftId);
    this.holderByNft.set(mint.nftId, this.vaultAddress);
    return { ...this.result(mint.hash, info), nftId: mint.nftId };
  }

  async offerTaskToAgent(
    nftId: string,
    pledge: Money,
    agentAddress: string,
    taskId: string,
  ): Promise<OfferTxResult> {
    this.agentAddresses.add(agentAddress);
    this.taskNftByTask.set(taskId, nftId);
    const info: EventInfo = {
      kind: "task_offer",
      taskId,
      amount: toMoney(fromMoney(pledge)),
      from: this.vaultAddress,
      to: agentAddress,
      nftId,
    };
    const offer = await this.events.run(
      single(info),
      () =>
        offerTaskToAgent(
          { vault: this.vault, nftId, pledgeAmount: fromMoney(pledge), agentAddress, taskId },
          this.c,
        ),
      (r) => ({ offerId: r.offerId }),
    );
    return { ...this.result(offer.hash, info), offerId: offer.offerId, nftId };
  }

  async acceptOffer(claimerSeed: string, offerId: string, ctx: TxContext): Promise<AcceptTxResult> {
    this.remember(ctx);
    const claimer = walletFromSeed(claimerSeed);
    const sub = !!ctx.subtaskId;
    const taskId = this.taskOf(ctx);
    const info: EventInfo = {
      kind: sub ? "subtask_claim" : "task_claim",
      taskId,
      subtaskId: ctx.subtaskId,
      from: claimer.classicAddress,
      offerId,
    };
    const claim = await this.events.run(
      single(info),
      () =>
        acceptOffer(
          {
            claimer,
            offerId,
            kind: sub ? "subtask.claim" : "task.claim",
            taskId: memoTaskId(taskId),
            subtaskId: ctx.subtaskId,
          },
          this.c,
        ),
      (r) => ({ nftId: r.nftId }),
    );
    this.holderByNft.set(claim.nftId, claim.holder);
    if (!sub && taskId) this.taskNftByTask.set(taskId, claim.nftId);
    return { ...this.result(claim.hash, info), nftId: claim.nftId, holder: claim.holder };
  }

  // ---------- sub-task NFT ----------

  async mintSubtaskNft(subtaskId: string, uri: string): Promise<NftTxResult> {
    const taskId = this.taskBySubtask.get(subtaskId);
    const known = taskId ? this.taskNftByTask.get(taskId) : undefined;
    if (!known) {
      console.warn(
        `[ledger port] mintSubtaskNft ${subtaskId}: the parent task NFT is not known in this process ` +
          `(task ${taskId ?? "unknown"}). Writing the placeholder parent ${UNKNOWN_PARENT_NFT_ID}; ` +
          `the NFT URI data still has parent_nft_id.`,
      );
    }
    const info: EventInfo = {
      kind: "subtask_nft_mint",
      taskId,
      subtaskId,
      from: this.vaultAddress,
    };
    const mint = await this.events.run(
      single(info),
      () =>
        mintSubtaskNft(
          {
            vault: this.vault,
            uri,
            subtaskId,
            taskId: memoTaskId(taskId),
            parentNftId: known ?? UNKNOWN_PARENT_NFT_ID,
          },
          this.c,
        ),
      (r) => ({ nftId: r.nftId }),
    );
    this.holderByNft.set(mint.nftId, this.vaultAddress);
    return { ...this.result(mint.hash, info), nftId: mint.nftId };
  }

  async offerSubtaskToAnyone(nftId: string, subtaskId: string): Promise<OfferTxResult> {
    const taskId = this.taskBySubtask.get(subtaskId);
    const info: EventInfo = {
      kind: "subtask_offer",
      taskId,
      subtaskId,
      amount: "0.00",
      from: this.vaultAddress,
      nftId,
    };
    const offer = await this.events.run(
      single(info),
      () =>
        offerSubtaskToAnyone(
          { vault: this.vault, nftId, subtaskId, taskId: memoTaskId(taskId) },
          this.c,
        ),
      (r) => ({ offerId: r.offerId }),
    );
    return { ...this.result(offer.hash, info), offerId: offer.offerId, nftId };
  }

  // ---------- payouts and burns ----------

  async createRedeemOffer(
    holderSeed: string,
    nftId: string,
    amount: Money,
    ctx: TxContext,
  ): Promise<OfferTxResult> {
    this.remember(ctx);
    const holder = walletFromSeed(holderSeed);
    const taskId = this.taskOf(ctx);
    const info: EventInfo = {
      kind: ctx.subtaskId ? "helper_redeem_offer" : "agent_redeem_offer",
      taskId,
      subtaskId: ctx.subtaskId,
      amount: toMoney(fromMoney(amount)),
      from: holder.classicAddress,
      to: this.vaultAddress,
      nftId,
    };
    const offer = await this.events.run(
      single(info),
      () =>
        createPayoutOffer(
          {
            holder,
            vaultAddress: this.vaultAddress,
            nftId,
            amount: fromMoney(amount),
            taskId,
            subtaskId: ctx.subtaskId,
            proofSha256: ctx.proofSha256,
          },
          this.c,
        ),
      (r) => ({ offerId: r.offerId }),
    );
    this.holderByNft.set(nftId, holder.classicAddress);
    return { ...this.result(offer.hash, info), offerId: offer.offerId, nftId };
  }

  async acceptRedeemOffer(offerId: string, ctx: TxContext): Promise<TxResult> {
    this.remember(ctx);
    const offer = await readOffer(this.c, offerId);
    const value = tokenValueOf(offer.amount, this.c.config);
    if (value === undefined || isZeroIouValue(value)) {
      throw new LedgerTxFailedError(
        `Offer ${offerId} does not ask a positive amount of the token`,
        "mismatch",
      );
    }
    const taskId = this.taskOf(ctx);
    const info: EventInfo = {
      kind: ctx.subtaskId ? "helper_payout" : "agent_payout",
      taskId,
      subtaskId: ctx.subtaskId,
      amount: toMoneyOrUndefined(value),
      from: this.vaultAddress,
      to: offer.owner,
      nftId: offer.nftId,
      offerId,
    };
    // acceptPayoutOffer checks the offer again (owner, Destination = vault, amount) before signing.
    const tx = await this.events.run(single(info), () =>
      acceptPayoutOffer(
        {
          vault: this.vault,
          offerId,
          nftId: offer.nftId,
          holderAddress: offer.owner,
          amount: value,
          taskId,
          subtaskId: ctx.subtaskId,
          proofSha256: ctx.proofSha256,
        },
        this.c,
      ),
    );
    this.holderByNft.set(offer.nftId, this.vaultAddress);
    return this.result(tx.hash, info);
  }

  async burn(nftId: string, ctx: TxContext): Promise<TxResult> {
    this.remember(ctx);
    const taskId = this.taskOf(ctx);
    const info: EventInfo = {
      kind: ctx.subtaskId ? "subtask_nft_burn" : "task_nft_burn",
      taskId,
      subtaskId: ctx.subtaskId,
      from: this.vaultAddress,
      nftId,
    };
    const tx = await this.events.run(single(info), async () => {
      const candidates = [this.vaultAddress, this.holderByNft.get(nftId), ...this.agentAddresses];
      const owner = await findNftHolder(
        this.c.client,
        nftId,
        candidates.filter((a): a is string => !!a),
      );
      return burnNft({ vault: this.vault, nftId, owner, taskId, subtaskId: ctx.subtaskId }, this.c);
    });
    this.holderByNft.delete(nftId);
    return this.result(tx.hash, info);
  }

  // ---------- failure flow ----------

  failTask(input: FailTaskInput): Promise<TxResult[]> {
    const existing = this.failRuns.get(input.taskId);
    if (existing) return existing;
    const run = this.runFailTask(input);
    this.failRuns.set(input.taskId, run);
    run.catch(() => this.failRuns.delete(input.taskId));
    return run;
  }

  /**
   * Our failTask refunds what the vault received on the ledger and cross-checks the caller's
   * amounts. The contract only has the totals (refundToRequester = price + pledge, refundToAgent =
   * the sum of the sub-task money), so this reads the vault history first and passes the ledger's
   * split. A difference from the server's totals is logged; the ledger amounts win, because they are
   * exactly what the vault holds for the task.
   */
  private async runFailTask(input: FailTaskInput): Promise<TxResult[]> {
    const vault = this.vaultAddress;
    const agentAddress = input.agentAddress || undefined;
    const history = await contractErrors(() => listCompleteAccountHistory(this.c.client, vault));
    const state = vaultStateFromHistory(vault, history, this.c.config);

    // What the vault received for this task (the same filters as our failTask uses).
    const deposits = state.deposits.filter((d) => d.taskId === input.taskId);
    const sum = (values: string[]) => (values.length ? addIouValues(...values) : "0");
    const price = sum(
      deposits
        .filter((d) => d.kind === "task.fund" && d.from === input.requesterAddress)
        .map((d) => d.value),
    );
    const pledge = sum(deposits.filter((d) => d.kind === "task.claim").map((d) => d.value));
    const funded: Record<string, string> = {};
    for (const d of deposits) {
      if (d.kind !== "subtask.fund" || !d.subtaskId || d.from !== agentAddress) continue;
      funded[d.subtaskId] = addIouValues(funded[d.subtaskId] ?? "0", d.value);
    }

    // The last account that accepted an offer for each NFT (history is newest first).
    const lastBuyer = (nftId: string) =>
      history.find(
        (tx) =>
          tx.type === "NFTokenAcceptOffer" &&
          tx.result === "tesSUCCESS" &&
          tx.nftId === nftId &&
          tx.account !== vault,
      )?.account;

    const nftBySubtask = new Map<string, string>();
    input.subtaskNftIds.forEach((nftId, i) => {
      nftBySubtask.set(input.subtaskIds?.[i] ?? nftId, nftId);
    });
    const subtaskIds = new Set([...nftBySubtask.keys(), ...Object.keys(funded)]);
    const subtasks: FailSubtaskInput[] = [...subtaskIds].map((subtaskId) => {
      const nftId = nftBySubtask.get(subtaskId);
      const helperAddress = nftId ? (this.holderByNft.get(nftId) ?? lastBuyer(nftId)) : undefined;
      return { subtaskId, nftId, amount: funded[subtaskId] ?? "0", helperAddress };
    });

    const toRequester = addIouValues(price, pledge);
    const toAgent = sum(Object.values(funded));
    if (
      compareIouValues(toRequester, fromMoney(input.refundToRequester)) !== 0 ||
      compareIouValues(toAgent, fromMoney(input.refundToAgent)) !== 0
    ) {
      console.warn(
        `[ledger port] failTask ${input.taskId}: the server expects refunds of ` +
          `${input.refundToRequester} to the requester and ${input.refundToAgent} to the agent; ` +
          `the vault received ${toRequester} and ${toAgent} on the ledger. Refunding the ledger amounts.`,
      );
    }

    const opInput = {
      vault: this.vault,
      taskId: input.taskId,
      taskNftId: input.taskNftId ?? undefined,
      requesterAddress: input.requesterAddress,
      price,
      pledge,
      agentAddress,
      subtasks,
    };

    // Plan once here so each submitted transaction gets its contract kind and fields. Our failTask
    // submits the burns, then the refunds, in this plan's order.
    const plan = await contractErrors(async () => planFailTask(opInput, state));
    const burns: EventInfo[] = [];
    const refunds: EventInfo[] = [];
    for (const step of plan.steps) {
      if (step.type === "burn") {
        burns.push({
          kind: step.memos.subtask ? "subtask_nft_burn" : "task_nft_burn",
          taskId: input.taskId,
          subtaskId: step.memos.subtask,
          from: vault,
          nftId: step.nftId,
        });
      } else {
        refunds.push({
          kind: step.memos.subtask ? "refund_agent" : "refund_requester",
          taskId: input.taskId,
          subtaskId: step.memos.subtask,
          amount: toMoneyOrUndefined(step.amount),
          from: vault,
          to: step.destination,
        });
      }
    }
    const byHash = new Map<string, EventInfo>();
    const result = await this.events.run(
      {
        describe: (e) => {
          const info =
            e.txType === "NFTokenBurn"
              ? (burns.shift() ?? { kind: "task_nft_burn", taskId: input.taskId, from: vault })
              : e.txType === "Payment"
                ? (refunds.shift() ?? {
                    kind: "refund_requester",
                    taskId: input.taskId,
                    from: vault,
                  })
                : undefined;
          if (info) byHash.set(e.hash, info);
          return info;
        },
      },
      () => failTask(opInput, this.c),
    );
    for (const line of result.skipped)
      console.info(`[ledger port] failTask ${input.taskId}: ${line}`);
    return [...result.burns, ...result.refunds].map((tx) =>
      this.result(
        tx.hash,
        byHash.get(tx.hash) ?? {
          kind: tx.kind === "nft.burn" ? "task_nft_burn" : "refund_requester",
          taskId: input.taskId,
        },
      ),
    );
  }

  // ---------- agent transactions ----------

  async verifyTx(hash: string, expect: VerifyTxExpect): Promise<VerifiedTx> {
    const { tx, meta } = await fetchValidatedTx(this.c, hash, this.options.verifyTimeoutMs);
    const config = this.c.config;
    const account = String(tx.Account);
    const memos = readMemos(tx.Memos);
    const taskId = expect.taskId ?? memos.task;
    const subtaskId = expect.subtaskId ?? memos.subtask;
    const code = String(meta.TransactionResult ?? "unknown");

    if (code !== "tesSUCCESS") {
      this.events.emit({
        ...this.events.event(hash, "failed", {
          kind: expect.kind,
          taskId,
          subtaskId,
          from: account,
        }),
        error: code,
      });
      throw new LedgerTxFailedError(`Transaction ${hash} failed with ${code}`, code, hash);
    }

    const problems: string[] = [];
    const want = (what: string, actual: unknown, expected: unknown) => {
      if (expected !== undefined && actual !== expected) {
        problems.push(`${what} is ${String(actual)}, expected ${String(expected)}`);
      }
    };
    const wantAmount = (what: string, amount: Amount | undefined, expected: Money | undefined) => {
      const value = tokenValueOf(amount, config);
      if (value === undefined)
        problems.push(
          `${what} is not ${config.XRPL_TOKEN_CURRENCY} of ${config.XRPL_TOKEN_ISSUER}`,
        );
      else if (expected !== undefined && compareIouValues(value, fromMoney(expected)) !== 0) {
        problems.push(`${what} is ${value}, expected ${fromMoney(expected)}`);
      }
      return value;
    };
    want("signer", account, expect.from);

    let info: EventInfo;
    switch (expect.kind) {
      case "task_claim": {
        want("transaction type", tx.TransactionType, "NFTokenAcceptOffer");
        const offerId = typeof tx.NFTokenSellOffer === "string" ? tx.NFTokenSellOffer : undefined;
        want("accepted offer", offerId?.toUpperCase(), expect.offerId?.toUpperCase());
        const nftId = getAcceptedNftId(meta as never);
        want("NFT", nftId, expect.nftId);
        const offer = deletedOffer(meta);
        info = {
          kind: "task_claim",
          taskId,
          subtaskId,
          amount: moneyOf(offer.amount, config),
          from: account,
          to: offer.owner,
          nftId,
          offerId,
        };
        break;
      }
      case "subtask_funding": {
        want("transaction type", tx.TransactionType, "Payment");
        want("destination", tx.Destination, expect.to ?? this.vaultAddress);
        const delivered = asAmount(meta.delivered_amount) ?? asAmount(tx.DeliverMax ?? tx.Amount);
        const value = wantAmount("delivered amount", delivered, expect.amount);
        if (expect.memo && !Object.values(memos).some((v) => v?.includes(expect.memo!))) {
          problems.push(`no memo contains ${expect.memo}`);
        }
        info = {
          kind: "subtask_funding",
          taskId,
          subtaskId,
          amount: toMoneyOrUndefined(value),
          from: account,
          to: typeof tx.Destination === "string" ? tx.Destination : undefined,
        };
        break;
      }
      case "agent_redeem_offer": {
        want("transaction type", tx.TransactionType, "NFTokenCreateOffer");
        if ((Number(tx.Flags ?? 0) & NFTokenCreateOfferFlags.tfSellNFToken) === 0) {
          problems.push("it is not a sell offer");
        }
        want("NFT", tx.NFTokenID, expect.nftId);
        want("offer destination", tx.Destination, this.vaultAddress);
        const value = wantAmount("offer amount", asAmount(tx.Amount), expect.amount);
        const offerId = getCreatedOfferId(meta as never);
        if (!offerId) problems.push("the metadata has no created offer");
        info = {
          kind: "agent_redeem_offer",
          taskId,
          subtaskId,
          amount: toMoneyOrUndefined(value),
          from: account,
          to: this.vaultAddress,
          nftId: typeof tx.NFTokenID === "string" ? tx.NFTokenID : undefined,
          offerId,
        };
        break;
      }
      default:
        throw new LedgerTxFailedError(
          `verifyTx does not support kind ${String((expect as { kind: unknown }).kind)}`,
          "mismatch",
          hash,
        );
    }
    if (problems.length > 0) {
      throw new LedgerTxFailedError(`verifyTx ${hash}: ${problems.join("; ")}`, "mismatch", hash);
    }

    // Remember what later calls need.
    this.agentAddresses.add(account);
    if (subtaskId && taskId) this.taskBySubtask.set(subtaskId, taskId);
    if (info.kind === "task_claim" && info.nftId) {
      this.holderByNft.set(info.nftId, account);
      if (taskId) this.taskNftByTask.set(taskId, info.nftId);
    }

    this.events.emit(this.events.event(hash, "validated", info));
    return {
      ...this.result(hash, info),
      validated: true,
      ...(info.nftId !== undefined ? { nftId: info.nftId } : {}),
      ...(info.offerId !== undefined ? { offerId: info.offerId } : {}),
    };
  }
}

/** Server side: vault-signed and server-held-seed operations. See packages/shared/src/ledger.ts. */
export async function createXrplLedger(options: XrplLedgerOptions): Promise<LedgerPort> {
  const config = configFromOptions(options);
  const vault = walletFromSeed(options.vaultSeed);
  const treasury = walletFromSeed(options.treasurySeed);
  const client = await contractErrors(() => getClient(config));
  return new XrplLedgerPort({ client, config }, vault, treasury, { ownsClient: true });
}
