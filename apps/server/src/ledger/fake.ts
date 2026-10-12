/**
 * FakeLedger: a full in-memory implementation of LedgerPort (and an AgentLedger for the agent
 * account), used with LEDGER_MODE=fake, in tests, and by the seed script.
 *
 * - RLUSD balances in integer cents, NFTs, and offers.
 * - Realistic 64-hex hashes / NFT IDs / offer IDs and r-addresses.
 * - Each call emits `pending`, waits `latencyMs`, then applies atomically and emits `validated`
 *   (or `failed` and throws). Two concurrent accepts of one offer: one wins, one AlreadyClaimedError.
 * - failTask is idempotent per task ID.
 */
import { randomBytes } from "node:crypto";
import {
  AlreadyClaimedError,
  explorerNftUrl,
  explorerTxUrl,
  fromCents,
  LedgerTxFailedError,
  TESTNET_EXPLORER,
  toCents,
  type AcceptTxResult,
  type AgentLedger,
  type CreatedWallet,
  type FailTaskInput,
  type LedgerPort,
  type Money,
  type NftTxResult,
  type OfferTxResult,
  type TxContext,
  type TxEvent,
  type TxKind,
  type TxListener,
  type TxResult,
  type VerifiedTx,
  type VerifyTxExpect,
  type WalletRole,
} from "@agent-pledge/shared";

const XRPL_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

function randomFrom(alphabet: string, n: number): string {
  const bytes = randomBytes(n);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}
export const fakeHash = () => randomBytes(32).toString("hex").toUpperCase();
export const fakeAddress = () => "r" + randomFrom(XRPL_ALPHABET, 33);
export const fakeSeed = () => "s" + randomFrom(XRPL_ALPHABET, 28);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Like the real ledger package: a proof hash must be 64 hex characters, checked before signing. */
function checkProof(ctx: TxContext): void {
  if (ctx.proofSha256 !== undefined && !/^[0-9a-fA-F]{64}$/.test(ctx.proofSha256)) {
    throw new LedgerTxFailedError(
      "Proof sha256 must be exactly 64 hex characters",
      "INVALID_INPUT",
    );
  }
}

const memoFor = (ctx: TxContext) =>
  ctx.subtaskId
    ? `agent-pledge:subtask:${ctx.subtaskId}`
    : ctx.taskId
      ? `agent-pledge:task:${ctx.taskId}`
      : undefined;

interface FakeNft {
  id: string;
  issuer: string;
  owner: string;
  uri: string;
  burned: boolean;
}
interface FakeOffer {
  id: string;
  nftId: string;
  owner: string;
  amountCents: number;
  destination?: string;
  open: boolean;
}
interface FakeTx extends TxEvent {
  done: Promise<void>;
}

export interface FakeLedgerOptions {
  latencyMs?: number;
  /** Use a fixed agent address (e.g. AGENT_ADDRESS); a random one otherwise. */
  agentAddress?: string;
  agentBalance?: Money;
  treasuryBalance?: Money;
  explorerBaseUrl?: string;
}

interface SubmitSpec {
  kind: TxKind;
  ctx?: TxContext;
  from?: string;
  to?: string;
  amountCents?: number;
  memo?: string;
  nftId?: string;
  offerId?: string;
}

export class FakeLedger implements LedgerPort {
  readonly vaultAddress = fakeAddress();
  readonly treasuryAddress = fakeAddress();
  readonly agentAddress: string;
  /** The agent's fake seed. Only the fake "agent side" uses it; a real server never has this. */
  readonly agentSeed = fakeSeed();
  readonly vaultSeed = fakeSeed();
  /** AgentLedger bound to the fake agent account (what the laptop would do in xrpl mode). */
  readonly agent: AgentLedger;

  latencyMs: number;
  private readonly explorerBase: string;
  private readonly balancesCents = new Map<string, number>();
  private readonly seedToAddress = new Map<string, string>();
  private readonly nfts = new Map<string, FakeNft>();
  private readonly offers = new Map<string, FakeOffer>();
  private readonly txs = new Map<string, FakeTx>();
  /** The agent-pledge/proof memo of each payout transaction (lower-case hex), by hash. */
  private readonly proofs = new Map<string, string>();
  private readonly failedTasks = new Map<string, Promise<TxResult[]>>();
  private readonly listeners = new Set<TxListener>();

  constructor(opts: FakeLedgerOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 300;
    this.explorerBase = opts.explorerBaseUrl ?? TESTNET_EXPLORER;
    this.agentAddress = opts.agentAddress || fakeAddress();
    this.seedToAddress.set(this.agentSeed, this.agentAddress);
    this.seedToAddress.set(this.vaultSeed, this.vaultAddress);
    this.balancesCents.set(this.vaultAddress, 0);
    this.balancesCents.set(this.agentAddress, toCents(opts.agentBalance ?? "100.00"));
    this.balancesCents.set(this.treasuryAddress, toCents(opts.treasuryBalance ?? "1000000.00"));

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.agent = {
      address: this.agentAddress,
      onTx: (l) => self.onTx(l),
      acceptOffer: (offerId, ctx) =>
        self.acceptOffer(self.agentSeed, offerId, { taskId: ctx?.taskId }),
      fundSubtask: (subtaskRef, amount, ctx) =>
        self.payment({
          kind: "subtask_funding",
          from: self.agentAddress,
          to: self.vaultAddress,
          amountCents: toCents(amount),
          ctx: { taskId: ctx?.taskId, subtaskId: subtaskRef },
        }),
      createRedeemOffer: (nftId, amount, ctx) =>
        self.sellOffer(
          self.agentAddress,
          nftId,
          toCents(amount),
          self.vaultAddress,
          "agent_redeem_offer",
          {
            taskId: ctx?.taskId,
          },
        ),
    };
  }

  // ---------- test helpers ----------

  balanceOf(address: string): Money {
    return fromCents(this.balancesCents.get(address) ?? 0);
  }
  balances(): Record<string, Money> {
    return Object.fromEntries([...this.balancesCents].map(([a, c]) => [a, fromCents(c)]));
  }
  getNft(nftId: string): Readonly<FakeNft> | undefined {
    return this.nfts.get(nftId);
  }
  getOffer(offerId: string): Readonly<FakeOffer> | undefined {
    return this.offers.get(offerId);
  }
  getTx(hash: string): Readonly<TxEvent> | undefined {
    return this.txs.get(hash);
  }
  addressForSeed(seed: string): string | undefined {
    return this.seedToAddress.get(seed);
  }
  /** The proof photo hash a transaction carries in its agent-pledge/proof memo, if any. */
  proofOf(hash: string): string | undefined {
    return this.proofs.get(hash);
  }

  // ---------- events ----------

  onTx(listener: TxListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(e: TxEvent) {
    const snapshot = { ...e };
    delete (snapshot as Partial<FakeTx>).done;
    for (const l of this.listeners) {
      try {
        l(snapshot);
      } catch {
        // ignore listener errors
      }
    }
  }

  explorerTxUrl(hash: string): string {
    return explorerTxUrl(hash, this.explorerBase);
  }
  explorerNftUrl(nftId: string): string {
    return explorerNftUrl(nftId, this.explorerBase);
  }

  /**
   * Core: emit pending, wait, apply atomically, emit validated or failed.
   * `apply` runs synchronously after the wait, so concurrent calls cannot interleave inside it.
   */
  private async submit<T extends object>(
    spec: SubmitSpec,
    apply: () => T & { nftId?: string; offerId?: string },
  ) {
    const hash = fakeHash();
    let resolveDone!: () => void;
    const tx: FakeTx = {
      hash,
      status: "pending",
      kind: spec.kind,
      taskId: spec.ctx?.taskId,
      subtaskId: spec.ctx?.subtaskId,
      amount: spec.amountCents != null ? fromCents(spec.amountCents) : undefined,
      currency: spec.amountCents != null ? "RLUSD" : undefined,
      from: spec.from,
      to: spec.to,
      memo: spec.memo ?? (spec.ctx ? memoFor(spec.ctx) : undefined),
      nftId: spec.nftId,
      offerId: spec.offerId,
      explorerUrl: this.explorerTxUrl(hash),
      done: new Promise<void>((r) => (resolveDone = r)),
    };
    this.txs.set(hash, tx);
    if (spec.ctx?.proofSha256) this.proofs.set(hash, spec.ctx.proofSha256.toLowerCase());
    this.emit(tx);
    await sleep(this.latencyMs);
    let result: T & { nftId?: string; offerId?: string };
    try {
      result = apply();
    } catch (err) {
      tx.status = "failed";
      tx.error =
        err instanceof LedgerTxFailedError
          ? (err.resultCode ?? err.message)
          : (err as Error).message;
      if (err instanceof AlreadyClaimedError) tx.error = "tecOBJECT_NOT_FOUND";
      this.emit(tx);
      resolveDone();
      if (err instanceof AlreadyClaimedError) throw new AlreadyClaimedError(err.message, hash);
      if (err instanceof LedgerTxFailedError)
        throw new LedgerTxFailedError(err.message, err.resultCode, hash);
      throw err;
    }
    if (result.nftId) tx.nftId = result.nftId;
    if (result.offerId) tx.offerId = result.offerId;
    tx.status = "validated";
    this.emit(tx);
    resolveDone();
    const base: TxResult = {
      hash,
      kind: spec.kind,
      explorerUrl: tx.explorerUrl,
      ...(tx.amount ? { amount: tx.amount } : {}),
      ...(spec.from ? { from: spec.from } : {}),
      ...(spec.to ? { to: spec.to } : {}),
    };
    return { ...base, ...result };
  }

  private move(from: string, to: string, cents: number) {
    const bal = this.balancesCents.get(from) ?? 0;
    if (bal < cents)
      throw new LedgerTxFailedError(`insufficient RLUSD in ${from}`, "tecUNFUNDED_PAYMENT");
    this.balancesCents.set(from, bal - cents);
    this.balancesCents.set(to, (this.balancesCents.get(to) ?? 0) + cents);
  }

  private seedAddress(seed: string): string {
    const a = this.seedToAddress.get(seed);
    if (!a) throw new LedgerTxFailedError("unknown seed", "temBAD_SIGNATURE");
    return a;
  }

  private payment(
    spec: SubmitSpec & { from: string; to: string; amountCents: number },
  ): Promise<TxResult> {
    return this.submit(spec, () => {
      this.move(spec.from, spec.to, spec.amountCents);
      return {};
    });
  }

  private mint(kind: TxKind, ctx: TxContext, uri: string): Promise<NftTxResult> {
    return this.submit({ kind, ctx, from: this.vaultAddress }, () => {
      const id = fakeHash();
      this.nfts.set(id, {
        id,
        issuer: this.vaultAddress,
        owner: this.vaultAddress,
        uri,
        burned: false,
      });
      return { nftId: id };
    });
  }

  private sellOffer(
    owner: string,
    nftId: string,
    amountCents: number,
    destination: string | undefined,
    kind: TxKind,
    ctx: TxContext,
  ): Promise<OfferTxResult> {
    return this.submit({ kind, ctx, from: owner, to: destination, amountCents, nftId }, () => {
      const nft = this.nfts.get(nftId);
      if (!nft || nft.burned) throw new LedgerTxFailedError("no such NFT", "tecNO_ENTRY");
      if (nft.owner !== owner)
        throw new LedgerTxFailedError("not the NFT owner", "tecNO_PERMISSION");
      const id = fakeHash();
      this.offers.set(id, { id, nftId, owner, amountCents, destination, open: true });
      return { offerId: id, nftId };
    });
  }

  /** Buyer accepts a sell offer: buyer pays the owner, NFT goes to the buyer. */
  private accept(buyer: string, offerId: string, kind: TxKind, ctx: TxContext) {
    const offer = this.offers.get(offerId);
    return this.submit(
      {
        kind,
        ctx,
        from: buyer,
        to: offer?.owner,
        amountCents: offer?.amountCents,
        offerId,
        nftId: offer?.nftId,
      },
      () => {
        const o = this.offers.get(offerId);
        if (!o || !o.open) throw new AlreadyClaimedError();
        if (o.destination && o.destination !== buyer) {
          throw new LedgerTxFailedError(
            "offer is reserved for another account",
            "tecNO_PERMISSION",
          );
        }
        const nft = this.nfts.get(o.nftId);
        if (!nft || nft.burned || nft.owner !== o.owner) throw new AlreadyClaimedError();
        if (o.amountCents > 0) this.move(buyer, o.owner, o.amountCents);
        nft.owner = buyer;
        o.open = false;
        for (const other of this.offers.values()) if (other.nftId === nft.id) other.open = false;
        return { nftId: nft.id, holder: buyer };
      },
    );
  }

  // ---------- LedgerPort ----------

  async createWallet(role: Extract<WalletRole, "requester" | "helper">): Promise<CreatedWallet> {
    const address = fakeAddress();
    const seed = fakeSeed();
    this.seedToAddress.set(seed, address);
    this.balancesCents.set(address, 0);
    await this.submit({ kind: "wallet_setup", to: address }, () => ({}));
    return { role, address, seed };
  }

  fundRequester(address: string, amount: Money, ctx?: TxContext): Promise<TxResult> {
    return this.payment({
      kind: "requester_funding",
      ctx,
      from: this.treasuryAddress,
      to: address,
      amountCents: toCents(amount),
    });
  }

  fundTask(requesterSeed: string, taskId: string, amount: Money): Promise<TxResult> {
    return this.payment({
      kind: "task_funding",
      ctx: { taskId },
      from: this.seedAddress(requesterSeed),
      to: this.vaultAddress,
      amountCents: toCents(amount),
    });
  }

  mintTaskNft(taskId: string, uri: string): Promise<NftTxResult> {
    return this.mint("task_nft_mint", { taskId }, uri);
  }

  offerTaskToAgent(
    nftId: string,
    pledge: Money,
    agentAddress: string,
    taskId: string,
  ): Promise<OfferTxResult> {
    return this.sellOffer(this.vaultAddress, nftId, toCents(pledge), agentAddress, "task_offer", {
      taskId,
    });
  }

  acceptOffer(claimerSeed: string, offerId: string, ctx: TxContext): Promise<AcceptTxResult> {
    return this.accept(
      this.seedAddress(claimerSeed),
      offerId,
      ctx.subtaskId ? "subtask_claim" : "task_claim",
      ctx,
    );
  }

  mintSubtaskNft(subtaskId: string, uri: string): Promise<NftTxResult> {
    return this.mint("subtask_nft_mint", { subtaskId }, uri);
  }

  offerSubtaskToAnyone(nftId: string, subtaskId: string): Promise<OfferTxResult> {
    return this.sellOffer(this.vaultAddress, nftId, 0, undefined, "subtask_offer", { subtaskId });
  }

  async createRedeemOffer(
    holderSeed: string,
    nftId: string,
    amount: Money,
    ctx: TxContext,
  ): Promise<OfferTxResult> {
    const kind = ctx.subtaskId ? "helper_redeem_offer" : "agent_redeem_offer";
    checkProof(ctx);
    return this.sellOffer(
      this.seedAddress(holderSeed),
      nftId,
      toCents(amount),
      this.vaultAddress,
      kind,
      ctx,
    );
  }

  async acceptRedeemOffer(offerId: string, ctx: TxContext): Promise<TxResult> {
    checkProof(ctx);
    return this.accept(
      this.vaultAddress,
      offerId,
      ctx.subtaskId ? "helper_payout" : "agent_payout",
      ctx,
    );
  }

  burn(nftId: string, ctx: TxContext): Promise<TxResult> {
    return this.burnAs(ctx.subtaskId ? "subtask_nft_burn" : "task_nft_burn", nftId, ctx);
  }

  private burnAs(kind: TxKind, nftId: string, ctx: TxContext): Promise<TxResult> {
    return this.submit({ kind, ctx, from: this.vaultAddress, nftId }, () => {
      const nft = this.nfts.get(nftId);
      if (!nft || nft.burned) throw new LedgerTxFailedError("no such NFT", "tecNO_ENTRY");
      nft.burned = true;
      for (const o of this.offers.values()) if (o.nftId === nftId) o.open = false;
      return {};
    });
  }

  failTask(input: FailTaskInput): Promise<TxResult[]> {
    const existing = this.failedTasks.get(input.taskId);
    if (existing) return existing;
    const run = (async () => {
      const ctx = { taskId: input.taskId };
      const jobs: Promise<TxResult>[] = [];
      if (input.taskNftId && this.nfts.get(input.taskNftId)?.burned === false) {
        jobs.push(this.burnAs("task_nft_burn", input.taskNftId, ctx));
      }
      input.subtaskNftIds.forEach((nftId, i) => {
        if (this.nfts.get(nftId)?.burned === false) {
          jobs.push(
            this.burnAs("subtask_nft_burn", nftId, {
              taskId: input.taskId,
              subtaskId: input.subtaskIds?.[i],
            }),
          );
        }
      });
      const toRequester = toCents(input.refundToRequester);
      if (toRequester > 0) {
        jobs.push(
          this.payment({
            kind: "refund_requester",
            ctx,
            from: this.vaultAddress,
            to: input.requesterAddress,
            amountCents: toRequester,
          }),
        );
      }
      const toAgent = toCents(input.refundToAgent);
      if (toAgent > 0) {
        if (!input.agentAddress)
          throw new LedgerTxFailedError("refundToAgent needs agentAddress", "temMALFORMED");
        jobs.push(
          this.payment({
            kind: "refund_agent",
            ctx,
            from: this.vaultAddress,
            to: input.agentAddress,
            amountCents: toAgent,
          }),
        );
      }
      return Promise.all(jobs);
    })();
    this.failedTasks.set(input.taskId, run);
    // A failed run may be retried.
    run.catch(() => this.failedTasks.delete(input.taskId));
    return run;
  }

  async verifyTx(hash: string, expect: VerifyTxExpect): Promise<VerifiedTx> {
    const tx = this.txs.get(hash);
    if (!tx) throw new LedgerTxFailedError(`transaction ${hash} not found`, "txnNotFound", hash);
    await tx.done;
    const fail = (why: string) => {
      throw new LedgerTxFailedError(`verifyTx ${hash}: ${why}`, "mismatch", hash);
    };
    if (tx.status !== "validated") fail(`status is ${tx.status}`);
    if (tx.kind !== expect.kind) fail(`kind is ${tx.kind}, expected ${expect.kind}`);
    if (expect.from && tx.from !== expect.from) fail(`from is ${tx.from}`);
    if (expect.to && tx.to !== expect.to) fail(`to is ${tx.to}`);
    if (expect.amount && tx.amount !== expect.amount) fail(`amount is ${tx.amount}`);
    if (expect.offerId && tx.offerId !== expect.offerId) fail(`offer is ${tx.offerId}`);
    if (expect.nftId && tx.nftId !== expect.nftId) fail(`nft is ${tx.nftId}`);
    if (expect.memo && !(tx.memo ?? "").includes(expect.memo)) fail(`memo is ${tx.memo}`);
    // Fake mode: the event was already emitted when the agent submitted it (same process).
    return {
      hash,
      kind: tx.kind,
      explorerUrl: tx.explorerUrl,
      validated: true,
      ...(tx.amount ? { amount: tx.amount } : {}),
      ...(tx.from ? { from: tx.from } : {}),
      ...(tx.to ? { to: tx.to } : {}),
      ...(tx.nftId ? { nftId: tx.nftId } : {}),
      ...(tx.offerId ? { offerId: tx.offerId } : {}),
    };
  }
}
