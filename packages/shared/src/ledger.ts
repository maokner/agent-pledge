import type { Currency, TxKind, TxStatus, WalletRole } from "./domain";
import type { Money } from "./money";

/**
 * Ledger interfaces. Binding contract between the server (apps/server), the local agent
 * (apps/local-agent), and the ledger package (packages/ledger, owned by the crypto teammate).
 *
 * Rules for every method that submits a transaction:
 * 1. Emit a `pending` TxEvent (via onTx) as soon as the transaction is submitted.
 * 2. Resolve only after the transaction is validated, so NFT IDs and offer IDs are known.
 * 3. Emit a `validated` TxEvent before resolving, or a `failed` TxEvent and throw a typed error.
 * Amounts are Money strings ("5.00") in RLUSD unless stated otherwise.
 */

/** Links a transaction to a task and/or sub-task. Used for memos and for board events. */
export interface TxContext {
  taskId?: string;
  subtaskId?: string;
  /** sha256 (hex) of the proof photo; written to the `agent-pledge/proof` memo of payout transactions. */
  proofSha256?: string;
}

export interface TxEvent {
  hash: string;
  status: TxStatus;
  kind: TxKind;
  taskId?: string;
  subtaskId?: string;
  amount?: Money;
  currency?: Currency;
  from?: string;
  to?: string;
  memo?: string;
  nftId?: string;
  offerId?: string;
  explorerUrl: string;
  /** Ledger result code or message when status is "failed". */
  error?: string;
}

export type TxListener = (event: TxEvent) => void;

export interface TxResult {
  hash: string;
  kind: TxKind;
  explorerUrl: string;
  amount?: Money;
  from?: string;
  to?: string;
}

export interface NftTxResult extends TxResult {
  nftId: string;
}

export interface OfferTxResult extends TxResult {
  offerId: string;
  nftId: string;
}

export interface AcceptTxResult extends TxResult {
  nftId: string;
  /** The new holder of the NFT. */
  holder: string;
}

export interface CreatedWallet {
  role: WalletRole;
  address: string;
  /** The secret seed. The server encrypts it (AES-256-GCM) before it stores it. */
  seed: string;
}

export interface FailTaskInput {
  taskId: string;
  /** Task NFT to burn, if it was minted. */
  taskNftId?: string | null;
  /** Sub-task NFTs to burn. The vault is the issuer and the NFTs are burnable, so it can burn them wherever they are. */
  subtaskNftIds: string[];
  requesterAddress: string;
  /** Vault -> requester: task price plus the agent's pledge if the agent claimed (PRD 2.3). "0.00" skips it. */
  refundToRequester: Money;
  agentAddress?: string | null;
  /** Vault -> agent: the sub-task money the agent paid in. "0.00" skips it. */
  refundToAgent: Money;
  /** Sub-task the agent refund belongs to, for the board (optional). */
  subtaskIds?: string[];
}

/** What verifyTx checks for a transaction the local agent submitted itself. */
export interface VerifyTxExpect {
  kind: Extract<TxKind, "task_claim" | "subtask_funding" | "agent_redeem_offer">;
  /** The signer (the agent address). */
  from?: string;
  /** Payment destination (the vault) for subtask_funding. */
  to?: string;
  /** Exact amount for subtask_funding (Payment) and agent_redeem_offer (offer Amount). */
  amount?: Money;
  /** For task_claim: the offer that must have been accepted. */
  offerId?: string;
  /** For task_claim and agent_redeem_offer: the NFT involved. */
  nftId?: string;
  /** For subtask_funding: the memo must contain this (the sub-task ID). */
  memo?: string;
  taskId?: string;
  subtaskId?: string;
}

export interface VerifiedTx extends TxResult {
  validated: true;
  nftId?: string;
  offerId?: string;
}

/**
 * Server-side ledger. Vault-signed operations plus operations signed with server-held
 * requester/helper seeds. Implemented by FakeLedger (apps/server/src/ledger/fake.ts) and by
 * createXrplLedger in packages/ledger.
 */
export interface LedgerPort {
  readonly vaultAddress: string;

  /** Subscribe to pending/validated/failed events for every transaction this port submits or verifies. */
  onTx(listener: TxListener): () => void;

  /** New wallet with XRP from the faucet and an RLUSD trust line (requester or helper). */
  createWallet(role: Extract<WalletRole, "requester" | "helper">): Promise<CreatedWallet>;
  /** Demo funding: treasury -> requester. Kind requester_funding. */
  fundRequester(address: string, amount: Money, ctx?: TxContext): Promise<TxResult>;
  /** Payment requester -> vault with the task ID memo. Kind task_funding. */
  fundTask(requesterSeed: string, taskId: string, amount: Money): Promise<TxResult>;
  /** NFTokenMint by the vault (tfBurnable | tfTransferable). `uri` = `${PUBLIC_API_URL}/tasks/${taskId}.json`. */
  mintTaskNft(taskId: string, uri: string): Promise<NftTxResult>;
  /** Sell offer, Amount = pledge, Destination = agent. Kind task_offer. */
  offerTaskToAgent(
    nftId: string,
    pledge: Money,
    agentAddress: string,
    taskId: string,
  ): Promise<OfferTxResult>;
  /**
   * The claimer accepts a sell offer (server-held seed; used for helpers). Kind subtask_claim when
   * ctx.subtaskId is set, else task_claim. Throws AlreadyClaimedError when the offer no longer exists.
   */
  acceptOffer(claimerSeed: string, offerId: string, ctx: TxContext): Promise<AcceptTxResult>;
  /** NFTokenMint for a sub-task. `uri` = `${PUBLIC_API_URL}/tasks/${subtaskId}.json` (has parent_nft_id). */
  mintSubtaskNft(subtaskId: string, uri: string): Promise<NftTxResult>;
  /** Sell offer, Amount = 0 (or 1 drop XRP), no Destination. Kind subtask_offer. */
  offerSubtaskToAnyone(nftId: string, subtaskId: string): Promise<OfferTxResult>;
  /**
   * The holder (server-held seed, i.e. a helper) offers the NFT to the vault for `amount`.
   * Kind helper_redeem_offer when ctx.subtaskId is set, else agent_redeem_offer.
   */
  createRedeemOffer(
    holderSeed: string,
    nftId: string,
    amount: Money,
    ctx: TxContext,
  ): Promise<OfferTxResult>;
  /** The vault accepts a holder's redeem offer: NFT back to the vault, holder paid. helper_payout / agent_payout. */
  acceptRedeemOffer(offerId: string, ctx: TxContext): Promise<TxResult>;
  /** NFTokenBurn by the vault. subtask_nft_burn when ctx.subtaskId is set, else task_nft_burn. */
  burn(nftId: string, ctx: TxContext): Promise<TxResult>;
  /**
   * Failure flow (PRD 2.3): burn the NFTs, refund the requester (price + pledge) and the agent
   * (sub-task money). Idempotent per taskId: a second call submits nothing and returns the first
   * call's results. Already-burned NFTs are skipped.
   */
  failTask(input: FailTaskInput): Promise<TxResult[]>;
  /**
   * Verifies a transaction the local agent submitted itself. Resolves when it is validated and matches
   * `expect`; emits a validated (or failed) TxEvent with expect.taskId/subtaskId so it reaches the board.
   * Throws LedgerTxFailedError when it failed or does not match.
   */
  verifyTx(hash: string, expect: VerifyTxExpect): Promise<VerifiedTx>;

  explorerTxUrl(hash: string): string;
  explorerNftUrl(nftId: string): string;

  /** Close connections. Optional. */
  close?(): Promise<void>;
}

/**
 * Local-agent-side ledger. The local agent signs on the laptop with its own seed.
 * The server never sees that seed.
 */
export interface AgentLedger {
  readonly address: string;
  onTx?(listener: TxListener): () => void;
  /** Claim a task: accept the vault's offer and pay the pledge in one transaction. Kind task_claim. */
  acceptOffer(offerId: string, ctx?: TxContext): Promise<AcceptTxResult>;
  /** Payment agent -> vault for a sub-task. The memo carries `subtaskRef` (the sub-task ID). Kind subtask_funding. */
  fundSubtask(subtaskRef: string, amount: Money, ctx?: TxContext): Promise<TxResult>;
  /** Sell the task NFT to the vault for `amount` (price + pledge). Kind agent_redeem_offer. */
  createRedeemOffer(nftId: string, amount: Money, ctx?: TxContext): Promise<OfferTxResult>;
  close?(): Promise<void>;
}

/** Options for packages/ledger createXrplLedger (server side). */
export interface XrplLedgerOptions {
  networkUrl: string; // wss://s.altnet.rippletest.net:51233
  vaultSeed: string;
  /** Demo treasury that funds requester wallets (fundRequester). */
  treasurySeed: string;
  rlusdIssuer: string;
  rlusdCurrency: string;
  explorerBaseUrl?: string; // https://testnet.xrpl.org
}

/** Options for packages/ledger createAgentLedger (laptop side). */
export interface AgentLedgerOptions {
  networkUrl: string;
  agentSeed: string;
  vaultAddress: string;
  rlusdIssuer: string;
  rlusdCurrency: string;
  explorerBaseUrl?: string;
}

// ---------- Typed errors ----------

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The offer no longer exists: someone else claimed first (R5). The server answers 409. */
export class AlreadyClaimedError extends LedgerError {
  constructor(
    message = "Already claimed",
    readonly hash?: string,
  ) {
    super(message, "already_claimed");
  }
}

/** Could not reach the network or timed out before validation. Safe to retry the whole call. */
export class LedgerNetworkError extends LedgerError {
  constructor(message = "Ledger network error") {
    super(message, "network");
  }
}

/** The transaction was submitted and failed (tec/tem code), or verifyTx found a mismatch. */
export class LedgerTxFailedError extends LedgerError {
  constructor(
    message: string,
    readonly resultCode?: string,
    readonly hash?: string,
  ) {
    super(message, "tx_failed");
  }
}

export const TESTNET_EXPLORER = "https://testnet.xrpl.org";
export const explorerTxUrl = (hash: string, base = TESTNET_EXPLORER) =>
  `${base}/transactions/${hash}`;
export const explorerNftUrl = (nftId: string, base = TESTNET_EXPLORER) => `${base}/nft/${nftId}`;
