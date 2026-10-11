/**
 * DRAFT CONTRACT, pending backend review for issue #17. See ./CONTRACT.md.
 *
 * Primitive types shared by every part of the contract.
 * Wire format is JSON with snake_case keys, matching the PRD's tool fields
 * (`time_limit_minutes`, `parent_nft_id`, ...).
 */

/**
 * An RLUSD amount as a decimal string, for example "5", "4.5" or "0.50".
 * Strings avoid float rounding and match how XRPL encodes issued-currency
 * values. The UI shows RLUSD as US dollars ("$4.00"), as the PRD does.
 */
export type RlusdAmount = string;

/** ISO 8601 timestamp in UTC, for example "2026-10-11T19:04:05.123Z". */
export type IsoDateTime = string;

/** Classic XRPL account address ("r..."). */
export type XrplAddress = string;

/** 64-character hex transaction hash. Known as soon as the transaction is signed. */
export type TxHash = string;

/** 64-character hex NFTokenID. */
export type NftId = string;

/** Server-generated task ID, for example "tsk_01JA...". */
export type TaskId = string;

/** Server-generated sub-task ID, for example "sub_01JA...". */
export type SubtaskId = string;

/**
 * Short code in the claim link `<board-url>/c/<code>` (PRD 7.3), for example "7Q2K".
 * Four characters from [A-Z0-9].
 */
export type ClaimCode = string;

/**
 * Status of a task or a sub-task card on the board (PRD 9.1).
 * - open: made, nobody holds its NFT yet
 * - claimed: the local agent (task) or a helper (sub-task) holds the NFT
 * - done: paid out, NFT burned
 * - failed: time ran out (or the PIN locked); money returned
 */
export type WorkStatus = "open" | "claimed" | "done" | "failed";

export const WORK_STATUSES = ["open", "claimed", "done", "failed"] as const satisfies readonly WorkStatus[];

/** Why a task or sub-task failed. */
export type FailureReason =
  | "no_claim_in_time" // no helper claimed the sub-task before the deadline
  | "no_pin_in_time" // a helper claimed, but no correct PIN before the deadline
  | "pin_locked" // three wrong PINs
  | "ledger_error"; // a required ledger transaction failed

/** Number of wrong PINs that lock a sub-task (PRD R8). */
export const MAX_PIN_ATTEMPTS = 3;
