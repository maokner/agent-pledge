/**
 * DRAFT CONTRACT, pending backend review for issue #17. See ./CONTRACT.md.
 *
 * HTTP endpoints: paths, auth, request bodies and response bodies.
 * All bodies are JSON unless marked multipart. Errors use ApiErrorBody.
 */
import type {
  ClaimCode,
  IsoDateTime,
  NftId,
  RlusdAmount,
  SubtaskId,
  TaskId,
  TxHash,
  WorkStatus,
} from "./common.ts";
import type {
  AgentLogLevel,
  AgentLogLine,
  LedgerTx,
  Photo,
  Subtask,
  Task,
  TxStatus,
} from "./entities.ts";
import type { BoardSnapshot } from "./events.ts";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Voice agent tools send the shared secret in this header. */
export const VOICE_SECRET_HEADER = "x-agent-pledge-secret";

/** The local agent sends `Authorization: Bearer <token>`. */
export const AGENT_AUTH_HEADER = "authorization";

/**
 * Signed cookie set by `POST /claim/:code/claim`. It ties a helper's phone to
 * the wallet the server made for them, so later claim calls know who is asking.
 * The browser sends it automatically (the client uses `credentials: "include"`).
 */
export const HELPER_COOKIE = "ap_helper";

/**
 * The real server returns a helper token in the claim response and accepts it
 * back in this header (it also sets a cookie per code, `ap_helper_<CODE>`).
 * The web app stores the token per code and sends this header, because the
 * claim page and the API are on different origins.
 */
export const HELPER_TOKEN_HEADER = "x-helper-token";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "bad_request" // 400: body failed validation
  | "unauthorized" // 401: missing or wrong secret, token or cookie
  | "not_found" // 404: unknown task, sub-task or claim code
  | "already_claimed" // 409: someone else claimed the sub-task first
  | "conflict" // 409: wrong state for this action, for example "not ready to claim yet"
  | "not_your_claim" // 401 (real server) or 403: photo or PIN from a phone that did not claim
  | "expired" // 410: the deadline passed
  | "wrong_pin" // 422: wrong PIN (the real server's answer; the client turns it into a "wrong" result)
  | "not_seat_hold" // 422: create_task for something that is not a seat hold
  | "payload_too_large" // 413: the photo is over the server's limit (8 MB)
  | "locked" // 423: three wrong PINs (the real server's code is "pin_locked")
  | "not_implemented" // 501
  | "ledger_error" // 502: an XRPL transaction failed
  | "internal"; // 500

export interface ApiErrorBody {
  error: ApiErrorCode;
  /** Human-readable, safe to show. */
  message: string;
}

// ---------------------------------------------------------------------------
// Voice agent tools (PRD 6). Auth: VOICE_SECRET_HEADER.
// ---------------------------------------------------------------------------

/** POST /tools/create_task */
export interface CreateTaskRequest {
  description: string;
  place: string;
  time_limit_minutes: number;
  /** The voice agent sends a JSON number, as the PRD names it. Example: 5. */
  price_usd: number;
  /** E.164, for example "+15105550123". Optional: the real server accepts none. */
  caller_phone?: string | null;
}

export interface CreateTaskResponse {
  task_id: TaskId;
  /** 4 digits, for example "4821". Only ever returned here. */
  pin: string;
  /** The real server sends `<web app>/?task=<id>`; the landing page redirects that to the board. */
  board_url: string;
  /** Sent by the real server. */
  status?: WorkStatus;
  price?: RlusdAmount;
  deadline_at?: IsoDateTime;
}

/** GET /tools/task_status/:taskId */
export interface TaskStatusResponse {
  task_id: TaskId;
  status: WorkStatus;
  /** The helper's photo note, for example "Front table, left side". */
  helper_note: string | null;
}

// ---------------------------------------------------------------------------
// Local agent (PRD 7.2). Auth: Bearer token.
//
// The local agent holds its own wallet key (PRD 4), so it signs its own
// transactions and sends the signed blob. The server submits it, tracks it,
// and emits tx.pending / tx.validated.
// ---------------------------------------------------------------------------

/** GET /agent/tasks/:id */
export interface AgentTaskResponse {
  task: Task;
  subtasks: Subtask[];
  /** The vault's sell offer for the task NFT (Destination = agent). Null until created. */
  task_offer_id: string | null;
}

/** POST /agent/tasks/:id/claim */
export interface ClaimTaskRequest {
  /** NFTokenAcceptOffer for task_offer_id, signed by the agent wallet. */
  signed_tx_blob: string;
}

export interface ClaimTaskResponse {
  task: Task;
  tx: LedgerTx;
}

/** POST /agent/tasks/:id/subtasks */
export interface CreateSubtaskRequest {
  description: string;
  place: string;
  time_limit_minutes: number;
  price: RlusdAmount;
  /** Payment agent -> vault for `price`, signed by the agent wallet. */
  signed_payment_blob: string;
}

export interface CreateSubtaskResponse {
  subtask: Subtask;
  /** Same as subtask.claim_url, for the Yik Yak post. */
  claim_url: string;
}

/** POST /agent/tasks/:id/redeem */
export interface RedeemTaskRequest {
  /** NFTokenCreateOffer (sell task NFT to the vault for price + pledge), signed by the agent wallet. */
  signed_offer_blob: string;
}

export interface RedeemTaskResponse {
  task: Task;
  txs: LedgerTx[];
}

/**
 * POST /agent/subtasks/:id/screenshot
 * multipart/form-data with fields:
 * - `screenshot`: image file (PNG or JPEG)
 * - `post_text`: the exact text that was posted
 * Emits `yikyak.posted`.
 */
export interface UploadScreenshotFields {
  post_text: string;
}

export interface UploadScreenshotResponse {
  subtask: Subtask;
}

/** POST /agent/log. Emits `agent.log`. */
export interface AgentLogRequest {
  task_id: TaskId | null;
  subtask_id: SubtaskId | null;
  level: AgentLogLevel;
  message: string;
}

export interface AgentLogResponse {
  line: AgentLogLine;
}

// ---------------------------------------------------------------------------
// Claim page (PRD 9.2). Auth: HELPER_COOKIE after the claim.
// ---------------------------------------------------------------------------

/**
 * What the claim page shows, from the point of view of the phone asking.
 * - open: nobody claimed yet; show the Claim button
 * - claimed_by_you: this phone holds the sub-task; show photo and PIN entry
 * - already_claimed: another phone claimed first
 * - expired: the deadline passed before payout (sub-task failed)
 * - locked: three wrong PINs
 * - paying: PIN correct, payout transaction pending
 * - paid: payout validated; show "Paid $4.00" with the explorer link
 */
export type ClaimState =
  "open" | "claimed_by_you" | "already_claimed" | "expired" | "locked" | "paying" | "paid";

export const CLAIM_STATES = [
  "open",
  "claimed_by_you",
  "already_claimed",
  "expired",
  "locked",
  "paying",
  "paid",
] as const satisfies readonly ClaimState[];

/** GET /claim/:code. Also the body of every successful claim-page response. */
export interface ClaimView {
  code: ClaimCode;
  state: ClaimState;
  subtask: {
    description: string;
    place: string;
    time_limit_minutes: number;
    deadline_at: IsoDateTime;
    price: RlusdAmount;
  };
  /** Only shown to the phone that claimed. */
  photo: Photo | null;
  pin_attempts_left: number;
  /** Set once the PIN is correct. */
  payout: {
    amount: RlusdAmount;
    tx_hash: TxHash;
    status: TxStatus;
    /** Explorer link, as the server builds it. */
    explorer_url?: string;
  } | null;
  /**
   * Server clock, so the countdown is right even if the phone clock is off.
   * The real server does not send one yet; its adapter puts the phone's clock here.
   */
  server_time: IsoDateTime;
}

/**
 * POST /claim/:code/claim (no body).
 * 200 ClaimView with state "claimed_by_you" and sets HELPER_COOKIE.
 * 409 ApiErrorBody "already_claimed" if another phone won.
 */
export type ClaimSubtaskResponse = ClaimView;

/**
 * POST /claim/:code/photo
 * multipart/form-data with fields:
 * - `photo`: image file
 * - `note`: short text, may be empty
 * Emits `photo.added`.
 */
export interface UploadPhotoFields {
  note: string;
}

export type UploadPhotoResponse = ClaimView;

/** POST /claim/:code/pin */
export interface SubmitPinRequest {
  /** 4 digits. */
  pin: string;
}

/**
 * Always 200 for a well-formed PIN from the claiming phone, so the page can
 * show wrong-PIN feedback without parsing errors.
 * Emits `pin.failed` or `pin.locked` on a wrong PIN.
 */
export interface SubmitPinResponse {
  result: "correct" | "wrong" | "locked";
  claim: ClaimView;
}

// ---------------------------------------------------------------------------
// Open sub-tasks for the human list page (/human). Public, no auth.
//
// DRAFT, NEW in the restyle, for the backend person (#17): no endpoint listed
// open sub-tasks before. It needs sign-off. See "Open sub-tasks" in
// ./CONTRACT.md for how the list stays fresh and the open questions.
// ---------------------------------------------------------------------------

/**
 * One open sub-task as the human list shows it. Each item links to its claim
 * page, `/c/<claim_code>`. No crypto fields: the human side never shows them.
 */
export interface OpenSubtaskSummary {
  claim_code: ClaimCode;
  /** What the helper gets. Example: "4.5". */
  price: RlusdAmount;
  /** What to do, for example "Save a seat at the big table". */
  description: string;
  place: string;
  time_limit_minutes: number;
  created_at: IsoDateTime;
  deadline_at: IsoDateTime;
}

/**
 * GET /subtasks/open (DRAFT).
 * Sub-tasks a helper could claim right now: status "open" and deadline_at
 * after server_time. Order is not guaranteed; clients sort.
 */
export interface ListOpenSubtasksResponse {
  /** Server clock, so countdowns are right even if the phone clock is off. */
  server_time: IsoDateTime;
  subtasks: OpenSubtaskSummary[];
}

// ---------------------------------------------------------------------------
// Board (PRD 9.1). Public, no auth.
// ---------------------------------------------------------------------------

/** GET /board/state */
export type BoardStateResponse = BoardSnapshot;

// ---------------------------------------------------------------------------
// NFT URI data (PRD 5.3). Public, no auth.
// ---------------------------------------------------------------------------

/** GET /tasks/:id.json, where :id is a task ID or a sub-task ID. */
export interface TaskNftData {
  id: TaskId | SubtaskId;
  type: "task" | "subtask";
  description: string;
  place: string;
  /** Null from the real server, which does not include it. */
  time_limit_minutes: number | null;
  price: RlusdAmount;
  /** Null from the real server, which does not include it. */
  created_at: IsoDateTime | null;
  /** Sent by the real server. */
  deadline_at?: IsoDateTime;
  status?: WorkStatus;
  nft_id?: NftId | null;
  /** Sub-tasks only. */
  parent_task_id: TaskId | null;
  /** Sub-tasks only: the parent task's NFT ID. */
  parent_nft_id: NftId | null;
  board_url: string;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;

/** Path builders, relative to the server's base URL. */
export const apiPaths = {
  createTask: () => "/tools/create_task",
  taskStatus: (taskId: TaskId) => `/tools/task_status/${enc(taskId)}`,

  agentTask: (taskId: TaskId) => `/agent/tasks/${enc(taskId)}`,
  agentClaimTask: (taskId: TaskId) => `/agent/tasks/${enc(taskId)}/claim`,
  agentCreateSubtask: (taskId: TaskId) => `/agent/tasks/${enc(taskId)}/subtasks`,
  agentRedeemTask: (taskId: TaskId) => `/agent/tasks/${enc(taskId)}/redeem`,
  agentScreenshot: (subtaskId: SubtaskId) => `/agent/subtasks/${enc(subtaskId)}/screenshot`,
  agentLog: () => "/agent/log",

  claim: (code: ClaimCode) => `/claim/${enc(code)}`,
  claimSubtask: (code: ClaimCode) => `/claim/${enc(code)}/claim`,
  claimPhoto: (code: ClaimCode) => `/claim/${enc(code)}/photo`,
  claimPin: (code: ClaimCode) => `/claim/${enc(code)}/pin`,

  /** DRAFT (#17). Not under /claim/, where it would collide with /claim/:code. */
  openSubtasks: () => "/subtasks/open",

  boardState: () => "/board/state",
  taskJson: (id: TaskId | SubtaskId) => `/tasks/${enc(id)}.json`,
} as const;
