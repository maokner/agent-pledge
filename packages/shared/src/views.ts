import { z } from "zod";
import {
  AgentLogLevel,
  Currency,
  IsoTime,
  MediaKind,
  SubtaskStatus,
  TaskStatus,
  TxKind,
  TxStatus,
} from "./domain";
import { Money } from "./money";

/**
 * View models the board, the claim page, and the local agent read.
 * Field names are snake_case on the wire. Nullable fields are always present (null, not missing).
 */

export const TxView = z.object({
  hash: z.string(),
  kind: TxKind,
  status: TxStatus,
  amount: Money.nullable(),
  currency: Currency.nullable(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  memo: z.string().nullable(),
  task_id: z.string().nullable(),
  subtask_id: z.string().nullable(),
  nft_id: z.string().nullable(),
  offer_id: z.string().nullable(),
  explorer_url: z.string(),
  error: z.string().nullable(),
  created_at: IsoTime,
  validated_at: IsoTime.nullable(),
});
export type TxView = z.infer<typeof TxView>;

export const MediaView = z.object({
  id: z.string(),
  kind: MediaKind,
  task_id: z.string().nullable(),
  subtask_id: z.string().nullable(),
  /** Absolute URL: `${PUBLIC_API_URL}/media/${id}`. */
  url: z.string(),
  mime_type: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  created_at: IsoTime,
});
export type MediaView = z.infer<typeof MediaView>;

/** PIN state. Never contains the PIN or its hash. */
export const PinState = z.object({
  attempts: z.number().int(),
  attempts_left: z.number().int(),
  locked: z.boolean(),
  verified: z.boolean(),
});
export type PinState = z.infer<typeof PinState>;

export const SubtaskView = z.object({
  id: z.string(),
  task_id: z.string(),
  price: Money,
  deadline: IsoTime,
  status: SubtaskStatus,
  claim_code: z.string(),
  /** `${PUBLIC_BASE_URL}/c/${claim_code}` — the link in the Yik Yak post. */
  claim_url: z.string(),
  helper_address: z.string().nullable(),
  nft_id: z.string().nullable(),
  nft_explorer_url: z.string().nullable(),
  offer_id: z.string().nullable(),
  helper_note: z.string().nullable(),
  photo: MediaView.nullable(),
  post_text: z.string().nullable(),
  yikyak_screenshot: MediaView.nullable(),
  yikyak_posted_at: IsoTime.nullable(),
  created_at: IsoTime,
  claimed_at: IsoTime.nullable(),
  done_at: IsoTime.nullable(),
  failed_at: IsoTime.nullable(),
  paid_at: IsoTime.nullable(),
  payout_tx_hash: z.string().nullable(),
});
export type SubtaskView = z.infer<typeof SubtaskView>;

export const TaskView = z.object({
  id: z.string(),
  board_code: z.string(),
  description: z.string(),
  place: z.string(),
  time_limit_minutes: z.number().int(),
  deadline: IsoTime,
  price: Money,
  pledge: Money,
  status: TaskStatus,
  requester_address: z.string().nullable(),
  agent_address: z.string().nullable(),
  nft_id: z.string().nullable(),
  nft_explorer_url: z.string().nullable(),
  offer_id: z.string().nullable(),
  created_at: IsoTime,
  claimed_at: IsoTime.nullable(),
  done_at: IsoTime.nullable(),
  failed_at: IsoTime.nullable(),
  fail_reason: z.string().nullable(),
  paid_at: IsoTime.nullable(),
  refunded_at: IsoTime.nullable(),
  pin: PinState,
  /** Oldest first. */
  subtasks: z.array(SubtaskView),
  /** All ledger transactions for this task and its sub-tasks, oldest first. */
  transactions: z.array(TxView),
});
export type TaskView = z.infer<typeof TaskView>;

export const AgentLogEntry = z.object({
  id: z.number().int(),
  at: IsoTime,
  task_id: z.string().nullable(),
  subtask_id: z.string().nullable(),
  level: AgentLogLevel,
  message: z.string(),
});
export type AgentLogEntry = z.infer<typeof AgentLogEntry>;

export const BoardState = z.object({
  /** The seq of the last event included in this snapshot. Resume with /ws/board?since=<seq>. */
  seq: z.number().int(),
  generated_at: IsoTime,
  /** Newest first. */
  tasks: z.array(TaskView),
  /** Newest first, at most 200 entries. */
  agent_log: z.array(AgentLogEntry),
  vault_address: z.string().nullable(),
  agent_address: z.string().nullable(),
});
export type BoardState = z.infer<typeof BoardState>;

/** What the helper's claim page sees for a sub-task. */
export const ClaimView = z.object({
  code: z.string(),
  subtask_id: z.string(),
  task_id: z.string(),
  description: z.string(),
  place: z.string(),
  price: Money,
  deadline: IsoTime,
  status: SubtaskStatus,
  /** True when the request carries a valid helper token for this sub-task. */
  claimed_by_you: z.boolean(),
  helper_note: z.string().nullable(),
  photo: MediaView.nullable(),
  pin: PinState,
  payout: z.object({ amount: Money, tx_hash: z.string(), explorer_url: z.string() }).nullable(),
});
export type ClaimView = z.infer<typeof ClaimView>;

/** The JSON that an NFT URI points to: GET /tasks/:id.json (task or sub-task ID). */
export const NftUriData = z.object({
  id: z.string(),
  kind: z.enum(["task", "subtask"]),
  description: z.string(),
  place: z.string(),
  price: Money,
  deadline: IsoTime,
  status: TaskStatus,
  nft_id: z.string().nullable(),
  /** Sub-tasks only: the parent task ID and the parent task NFT ID (PRD 5.3). Null for tasks. */
  parent_task_id: z.string().nullable(),
  parent_nft_id: z.string().nullable(),
  board_url: z.string(),
});
export type NftUriData = z.infer<typeof NftUriData>;
