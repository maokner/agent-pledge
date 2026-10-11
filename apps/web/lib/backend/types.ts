/**
 * The real server's wire types, mirrored as plain TypeScript.
 *
 * Copied from `origin/backend-all:packages/shared/src/{views,events,api,domain}.ts`
 * at commit 52c72be (branch head 2db3fa5), where they are zod schemas. Only the
 * shapes the web app reads are here. Once the frontend and backend branches
 * merge, replace this file with imports from the backend's `@agent-pledge/shared`.
 *
 * The rest of the web app never imports these: lib/backend maps them into the
 * web app's own types (the DRAFT `@agent-pledge/shared` in packages/shared).
 */

/** "5.00": always two decimals. */
export type BackendMoney = string;
/** ISO 8601 UTC. */
export type BackendIsoTime = string;

export type BackendTaskStatus = "open" | "claimed" | "done" | "failed";
export type BackendSubtaskStatus = BackendTaskStatus;
export type BackendTxStatus = "pending" | "validated" | "failed";

export type BackendTxKind =
  | "wallet_setup"
  | "requester_funding"
  | "task_funding"
  | "task_nft_mint"
  | "task_offer"
  | "task_claim"
  | "subtask_funding"
  | "subtask_nft_mint"
  | "subtask_offer"
  | "subtask_claim"
  | "helper_redeem_offer"
  | "helper_payout"
  | "agent_redeem_offer"
  | "agent_payout"
  | "task_nft_burn"
  | "subtask_nft_burn"
  | "refund_requester"
  | "refund_agent";

export type BackendCurrency = "RLUSD" | "XRP";
export type BackendMediaKind = "photo" | "yikyak_screenshot";
export type BackendAgentLogLevel = "info" | "decision" | "error";

export interface BackendTxView {
  hash: string;
  kind: BackendTxKind;
  status: BackendTxStatus;
  amount: BackendMoney | null;
  currency: BackendCurrency | null;
  from: string | null;
  to: string | null;
  memo: string | null;
  task_id: string | null;
  subtask_id: string | null;
  nft_id: string | null;
  offer_id: string | null;
  explorer_url: string;
  error: string | null;
  created_at: BackendIsoTime;
  validated_at: BackendIsoTime | null;
}

export interface BackendMediaView {
  id: string;
  kind: BackendMediaKind;
  task_id: string | null;
  subtask_id: string | null;
  /** `${PUBLIC_API_URL}/media/${id}` */
  url: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  created_at: BackendIsoTime;
}

/** PIN state. Lives on the task, not the sub-task. */
export interface BackendPinState {
  attempts: number;
  attempts_left: number;
  locked: boolean;
  verified: boolean;
}

/** No description, place or time limit: those come from the parent task. */
export interface BackendSubtaskView {
  id: string;
  task_id: string;
  price: BackendMoney;
  deadline: BackendIsoTime;
  status: BackendSubtaskStatus;
  claim_code: string;
  claim_url: string;
  helper_address: string | null;
  nft_id: string | null;
  nft_explorer_url: string | null;
  offer_id: string | null;
  helper_note: string | null;
  photo: BackendMediaView | null;
  post_text: string | null;
  yikyak_screenshot: BackendMediaView | null;
  yikyak_posted_at: BackendIsoTime | null;
  created_at: BackendIsoTime;
  claimed_at: BackendIsoTime | null;
  done_at: BackendIsoTime | null;
  failed_at: BackendIsoTime | null;
  paid_at: BackendIsoTime | null;
  payout_tx_hash: string | null;
}

export interface BackendTaskView {
  id: string;
  board_code: string;
  description: string;
  place: string;
  time_limit_minutes: number;
  deadline: BackendIsoTime;
  price: BackendMoney;
  pledge: BackendMoney;
  status: BackendTaskStatus;
  requester_address: string | null;
  agent_address: string | null;
  nft_id: string | null;
  nft_explorer_url: string | null;
  offer_id: string | null;
  created_at: BackendIsoTime;
  claimed_at: BackendIsoTime | null;
  done_at: BackendIsoTime | null;
  failed_at: BackendIsoTime | null;
  /** Free text, for example "No helper claimed the sub-task in time". */
  fail_reason: string | null;
  paid_at: BackendIsoTime | null;
  refunded_at: BackendIsoTime | null;
  pin: BackendPinState;
  /** Oldest first. */
  subtasks: BackendSubtaskView[];
  /** The task's and its sub-tasks' transactions, oldest first. */
  transactions: BackendTxView[];
}

export interface BackendAgentLogEntry {
  id: number;
  at: BackendIsoTime;
  task_id: string | null;
  subtask_id: string | null;
  level: BackendAgentLogLevel;
  message: string;
}

/** GET /board/state, and the `state` of the socket's snapshot message. */
export interface BackendBoardState {
  seq: number;
  generated_at: BackendIsoTime;
  /** Newest first. */
  tasks: BackendTaskView[];
  /** Newest first, at most 200. */
  agent_log: BackendAgentLogEntry[];
  vault_address: string | null;
  agent_address: string | null;
}

export interface BackendPayout {
  amount: BackendMoney;
  tx_hash: string;
  explorer_url: string;
}

/** GET /claim/:code. No server_time. */
export interface BackendClaimView {
  code: string;
  subtask_id: string;
  task_id: string;
  description: string;
  place: string;
  price: BackendMoney;
  deadline: BackendIsoTime;
  status: BackendSubtaskStatus;
  /** True when the request carried this sub-task's helper token. */
  claimed_by_you: boolean;
  helper_note: string | null;
  photo: BackendMediaView | null;
  pin: BackendPinState;
  payout: BackendPayout | null;
}

/** POST /claim/:code/claim */
export interface BackendClaimSubtaskResponse {
  helper_token: string;
  claim: BackendClaimView;
}

/** POST /claim/:code/photo */
export interface BackendPhotoResponse {
  claim: BackendClaimView;
  media: BackendMediaView | null;
}

/** POST /claim/:code/pin, 200 */
export interface BackendPinResponse {
  claim: BackendClaimView;
  payout: BackendPayout;
}

/** 422 wrong_pin and 423 pin_locked `details`. */
export interface BackendPinErrorDetails {
  attempts: number;
  attempts_left: number;
}

/** Every error body. */
export interface BackendApiError {
  error: string;
  message: string;
  details?: unknown;
}

/** GET /tasks/:id.json */
export interface BackendNftUriData {
  id: string;
  kind: "task" | "subtask";
  description: string;
  place: string;
  price: BackendMoney;
  deadline: BackendIsoTime;
  status: BackendTaskStatus;
  nft_id: string | null;
  parent_task_id: string | null;
  parent_nft_id: string | null;
  board_url: string;
}

/** POST /tools/create_task, 200 */
export interface BackendCreateTaskResponse {
  task_id: string;
  pin: string;
  /** `${PUBLIC_BASE_URL}/?task=<id>` */
  board_url: string;
  status: BackendTaskStatus;
  price: BackendMoney;
  deadline: BackendIsoTime;
}

/** The `data` of each board socket event. */
export interface BackendBoardEventData {
  "task.created": { task: BackendTaskView };
  "task.claimed": { task: BackendTaskView };
  "subtask.created": { subtask: BackendSubtaskView };
  "subtask.claimed": { subtask: BackendSubtaskView };
  "tx.pending": { tx: BackendTxView };
  "tx.validated": { tx: BackendTxView };
  "tx.failed": { tx: BackendTxView };
  "photo.added": { task_id: string; subtask_id: string; media: BackendMediaView | null; helper_note: string | null };
  "yikyak.posted": { task_id: string; subtask_id: string; media: BackendMediaView; post_text: string; posted_at: BackendIsoTime };
  "pin.failed": { task_id: string; subtask_id: string; attempts: number; attempts_left: number };
  "pin.locked": { task_id: string; subtask_id: string; attempts: number };
  "subtask.paid": { subtask: BackendSubtaskView; amount: BackendMoney; tx_hash: string; explorer_url: string };
  "task.paid": { task: BackendTaskView; amount: BackendMoney; tx_hash: string; explorer_url: string };
  "task.failed": { task: BackendTaskView; reason: string };
  "agent.log": { entry: BackendAgentLogEntry };
}

export type BackendBoardEventType = keyof BackendBoardEventData;

export type BackendBoardEvent = {
  [K in BackendBoardEventType]: { seq: number; type: K; at: BackendIsoTime; data: BackendBoardEventData[K] };
}[BackendBoardEventType];

/** Sent on connect without `since`, and when a reconnecting client is too far behind or the server restarted. */
export interface BackendBoardSnapshotMessage {
  type: "snapshot";
  seq: number;
  state: BackendBoardState;
}

export type BackendBoardServerMessage = BackendBoardEvent | BackendBoardSnapshotMessage;
