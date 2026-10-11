/**
 * DRAFT CONTRACT, pending backend review for issue #17. See ../CONTRACT.md.
 *
 * The objects the server stores and sends to the board. HTTP responses and
 * WebSocket events carry these whole objects (not diffs), so a client can
 * always replace its copy by ID.
 */
import type {
  ClaimCode,
  FailureReason,
  IsoDateTime,
  NftId,
  RlusdAmount,
  SubtaskId,
  TaskId,
  TxHash,
  WorkStatus,
  XrplAddress,
} from "./common.ts";

/** A job from the requester, for example "save a seat, $5" (PRD 1, 2.1). */
export interface Task {
  id: TaskId;
  /** The base demo only supports seat holds (PRD 6). */
  kind: "seat_hold";
  /** What to do, in the requester's words. Example: "Save me a seat at the front table". */
  description: string;
  /** Where. Example: "Main Stacks, front table". */
  place: string;
  time_limit_minutes: number;
  /** What the requester pays into the vault. Example: "5". */
  price: RlusdAmount;
  /** What the local agent locks when it claims. Example: "1". */
  pledge: RlusdAmount;
  status: WorkStatus;
  created_at: IsoDateTime;
  /** created_at + time_limit_minutes. */
  deadline_at: IsoDateTime;
  claimed_at: IsoDateTime | null;
  /** When the task became done or failed. */
  finished_at: IsoDateTime | null;
  requester_address: XrplAddress;
  /** The local agent's wallet. Null until the task is claimed. */
  agent_address: XrplAddress | null;
  /** Null until the NFTokenMint is validated. */
  nft_id: NftId | null;
  /** Sub-tasks in creation order. Usually one; a re-post makes a new one (PRD 5.3). */
  subtask_ids: SubtaskId[];
  failure_reason: FailureReason | null;
}

/** A smaller job that the local agent gives to a helper (PRD 1, 5.3). */
export interface Subtask {
  id: SubtaskId;
  task_id: TaskId;
  claim_code: ClaimCode;
  /** Full claim link, `<board-url>/c/<claim_code>`. */
  claim_url: string;
  description: string;
  place: string;
  time_limit_minutes: number;
  /** What the helper gets. Example: "4". */
  price: RlusdAmount;
  status: WorkStatus;
  created_at: IsoDateTime;
  deadline_at: IsoDateTime;
  claimed_at: IsoDateTime | null;
  finished_at: IsoDateTime | null;
  /** Null until the NFTokenMint is validated. */
  nft_id: NftId | null;
  /** The parent task's NFT ID, also in the NFT URI data (PRD 5.3). */
  parent_nft_id: NftId | null;
  /** The wallet the server made for the helper. Null until claimed. */
  helper_address: XrplAddress | null;
  /** The helper's proof photo and note. Null until added. */
  photo: Photo | null;
  /** The Yik Yak post for this sub-task. Null until posted. */
  yikyak_post: YikYakPost | null;
  /** Starts at MAX_PIN_ATTEMPTS. */
  pin_attempts_left: number;
  /** True after three wrong PINs. */
  pin_locked: boolean;
  failure_reason: FailureReason | null;
}

/** The helper's seat photo and note (PRD 9.2 step 5). */
export interface Photo {
  /** Absolute URL served by the server. */
  url: string;
  /** Example: "Front table, left side". */
  note: string | null;
  added_at: IsoDateTime;
}

/** A Yik Yak post made by the local agent's browser agent (PRD 8). */
export interface YikYakPost {
  text: string;
  /** Absolute URL of the screenshot served by the server. */
  screenshot_url: string;
  posted_at: IsoDateTime;
}

/** What a ledger transaction does in the demo flow (PRD 5.4). */
export type TxKind =
  | "task_escrow" // Payment requester -> vault, task price
  | "task_nft_mint" // NFTokenMint by the vault
  | "task_nft_offer" // NFTokenCreateOffer by the vault, Amount = pledge, Destination = agent
  | "task_claim" // NFTokenAcceptOffer by the local agent (pays the pledge)
  | "subtask_escrow" // Payment agent -> vault, sub-task price
  | "subtask_nft_mint" // NFTokenMint by the vault
  | "subtask_nft_offer" // NFTokenCreateOffer by the vault, Amount = 0, no Destination
  | "subtask_claim" // NFTokenAcceptOffer by the helper wallet
  | "helper_payout_offer" // NFTokenCreateOffer by the helper, Amount = sub-task price, Destination = vault
  | "helper_payout" // NFTokenAcceptOffer by the vault: helper gets the sub-task price
  | "agent_payout_offer" // NFTokenCreateOffer by the agent, Amount = price + pledge, Destination = vault
  | "agent_payout" // NFTokenAcceptOffer by the vault: agent gets price + pledge
  | "nft_burn" // NFTokenBurn by the vault
  | "requester_refund" // Payment vault -> requester, price + pledge (failure)
  | "agent_refund"; // Payment vault -> agent, sub-task price (failure)

export type XrplTxType =
  | "Payment"
  | "NFTokenMint"
  | "NFTokenCreateOffer"
  | "NFTokenAcceptOffer"
  | "NFTokenBurn";

/**
 * - pending: submitted, not yet in a validated ledger (show "pending", PRD 11)
 * - validated: in a validated ledger with tesSUCCESS
 * - failed: in a validated ledger with a non-tesSUCCESS result, or dropped
 */
export type TxStatus = "pending" | "validated" | "failed";

/** One ledger transaction shown on the board with an explorer link (PRD 9.1). */
export interface LedgerTx {
  /** Primary key. The same hash moves from pending to validated. */
  hash: TxHash;
  kind: TxKind;
  tx_type: XrplTxType;
  task_id: TaskId;
  /** Set for sub-task transactions. */
  subtask_id: SubtaskId | null;
  /** The signing account. */
  from: XrplAddress;
  /** Payment Destination, offer Destination, or the accepting counterparty. Null if none. */
  to: XrplAddress | null;
  /** RLUSD moved by this transaction. Null for mints, burns and zero-amount offers. */
  amount: RlusdAmount | null;
  status: TxStatus;
  /** Engine result, for example "tesSUCCESS". Null while pending. */
  engine_result: string | null;
  ledger_index: number | null;
  submitted_at: IsoDateTime;
  validated_at: IsoDateTime | null;
}

export type AgentLogLevel = "info" | "decision" | "warning" | "error";

/** One line of the local agent's decision log (PRD 9.1). */
export interface AgentLogLine {
  id: string;
  at: IsoDateTime;
  task_id: TaskId | null;
  subtask_id: SubtaskId | null;
  level: AgentLogLevel;
  /** Example: "Sub-task price: $4.00 (80% of $5.00)". */
  message: string;
}
