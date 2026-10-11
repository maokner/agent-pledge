/**
 * DRAFT CONTRACT, pending backend review for issue #17. See ../CONTRACT.md.
 *
 * WebSocket messages.
 *
 * Board socket: `GET /ws/board?since=<seq>` (public).
 * - Every board event has a `seq`: one global counter for the whole server,
 *   starting at 1, increasing by exactly 1 per event, never reused.
 * - On connect, the server sends the events with seq > since, in order.
 *   If it no longer has them (or `since` is missing), it sends one
 *   `board.snapshot` message first, then live events.
 * - A client that sees a gap (seq > last seq + 1) reconnects with
 *   since = last seq it applied. A client that sees seq <= last seq ignores it.
 *
 * Agent socket: `GET /ws/agent` with the Bearer token. Server sends `task.new`.
 */
import type { IsoDateTime } from "./common.ts";
import type { AgentLogLine, LedgerTx, Subtask, Task } from "./entities.ts";

/** Full board state at one point in the event stream. Also `GET /board/state`. */
export interface BoardSnapshot {
  /** The seq of the last event included in this snapshot. 0 if there are none yet. */
  seq: number;
  generated_at: IsoDateTime;
  tasks: Task[];
  subtasks: Subtask[];
  txs: LedgerTx[];
  /** The most recent agent log lines, oldest first. The server may cap the count. */
  agent_log: AgentLogLine[];
}

interface BoardEventBase<Type extends string, Data> {
  type: Type;
  seq: number;
  at: IsoDateTime;
  data: Data;
}

/**
 * Optional extras on task events. The real server sends the whole task with its
 * sub-tasks and transactions, so its adapter (apps/web/lib/backend) fills these in;
 * a client upserts them by ID like the task.
 */
interface TaskExtras {
  subtasks?: Subtask[];
  txs?: LedgerTx[];
}

/** A voice call (or the backup form) made a task. The real server sends it twice: once at once, once with the NFT and offer. */
export type TaskCreatedEvent = BoardEventBase<"task.created", { task: Task } & TaskExtras>;
/** The local agent accepted the task NFT offer. */
export type TaskClaimedEvent = BoardEventBase<"task.claimed", { task: Task } & TaskExtras>;
/** The local agent made a sub-task. The parent task's subtask_ids changed too. */
export type SubtaskCreatedEvent = BoardEventBase<"subtask.created", { subtask: Subtask; task: Task }>;
/** A helper accepted the sub-task NFT offer. */
export type SubtaskClaimedEvent = BoardEventBase<"subtask.claimed", { subtask: Subtask }>;
/** A transaction was submitted. */
export type TxPendingEvent = BoardEventBase<"tx.pending", { tx: LedgerTx }>;
/** A transaction failed on the ledger (`tx.status` is "failed"). The real server sends this instead of a failed tx.validated. */
export type TxFailedEvent = BoardEventBase<"tx.failed", { tx: LedgerTx }>;
/**
 * A transaction reached a validated ledger. `tx.status` is "validated" or "failed".
 * `task` / `subtask` are set when the transaction changed them, for example
 * `nft_id` after an NFTokenMint. Null otherwise.
 */
export type TxValidatedEvent = BoardEventBase<
  "tx.validated",
  { tx: LedgerTx; task: Task | null; subtask: Subtask | null }
>;
/** The helper added a photo and note. `subtask.photo` is set. */
export type PhotoAddedEvent = BoardEventBase<"photo.added", { subtask: Subtask }>;
/** The local agent posted on Yik Yak. `subtask.yikyak_post` is set. */
export type YikYakPostedEvent = BoardEventBase<"yikyak.posted", { subtask: Subtask }>;
/** A wrong PIN. `subtask.pin_attempts_left` went down. */
export type PinFailedEvent = BoardEventBase<"pin.failed", { subtask: Subtask }>;
/** The third wrong PIN. `subtask.pin_locked` is true. */
export type PinLockedEvent = BoardEventBase<"pin.locked", { subtask: Subtask }>;
/** The helper entered the right PIN and was paid. Carries the sub-task's new state. */
export type SubtaskPaidEvent = BoardEventBase<"subtask.paid", { subtask: Subtask }>;
/** Helper and agent were paid. Carries the final state of the task and its sub-tasks. */
export type TaskPaidEvent = BoardEventBase<"task.paid", { task: Task; subtasks: Subtask[]; txs?: LedgerTx[] }>;
/** The task failed and money was returned. Carries the final state of the task and its sub-tasks. */
export type TaskFailedEvent = BoardEventBase<"task.failed", { task: Task; subtasks: Subtask[]; txs?: LedgerTx[] }>;
/** One line of the local agent's decision log. */
export type AgentLogEvent = BoardEventBase<"agent.log", { line: AgentLogLine }>;

export type BoardEvent =
  | TaskCreatedEvent
  | TaskClaimedEvent
  | SubtaskCreatedEvent
  | SubtaskClaimedEvent
  | TxPendingEvent
  | TxValidatedEvent
  | TxFailedEvent
  | PhotoAddedEvent
  | YikYakPostedEvent
  | PinFailedEvent
  | PinLockedEvent
  | SubtaskPaidEvent
  | TaskPaidEvent
  | TaskFailedEvent
  | AgentLogEvent;

export type BoardEventType = BoardEvent["type"];

export const BOARD_EVENT_TYPES = [
  "task.created",
  "task.claimed",
  "subtask.created",
  "subtask.claimed",
  "tx.pending",
  "tx.validated",
  "tx.failed",
  "photo.added",
  "yikyak.posted",
  "pin.failed",
  "pin.locked",
  "subtask.paid",
  "task.paid",
  "task.failed",
  "agent.log",
] as const satisfies readonly BoardEventType[];

/** Sent instead of a replay when the server cannot replay from `since`. */
export interface BoardSnapshotMessage {
  type: "board.snapshot";
  snapshot: BoardSnapshot;
}

/** Everything the server sends on the board socket. */
export type BoardServerMessage = BoardEvent | BoardSnapshotMessage;

/** Board socket path. Append `?since=<seq>`. */
export const BOARD_WS_PATH = "/ws/board";

/** Agent socket path. */
export const AGENT_WS_PATH = "/ws/agent";

/** A new task for the local agent to work on (PRD 7.1 step 1). */
export interface TaskNewMessage {
  type: "task.new";
  data: { task: Task };
}

/** Everything the server sends on the agent socket. */
export type AgentServerMessage = TaskNewMessage;
