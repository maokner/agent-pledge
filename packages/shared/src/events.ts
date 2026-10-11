import { z } from "zod";
import { IsoTime, PIN_MAX_ATTEMPTS } from "./domain";
import { Money } from "./money";
import { AgentLogEntry, BoardState, MediaView, SubtaskView, TaskView, TxView } from "./views";

/**
 * Board WebSocket (/ws/board) events.
 *
 * Every event is an envelope { seq, type, at, data }. `seq` increases by 1 per event within a
 * server process. After a restart it jumps forward (it starts at the boot time in ms), so it is
 * monotonic but not contiguous across restarts. Clients upsert by ID: task events carry the full
 * TaskView, sub-task events the full SubtaskView, tx events the full TxView.
 */

const TaskData = z.object({ task: TaskView });
const SubtaskData = z.object({ subtask: SubtaskView });
const TxData = z.object({ tx: TxView });

export const BoardEventDataSchemas = {
  "task.created": TaskData,
  "task.claimed": TaskData,
  "subtask.created": SubtaskData,
  "subtask.claimed": SubtaskData,
  "tx.pending": TxData,
  "tx.validated": TxData,
  "tx.failed": TxData,
  "photo.added": z.object({
    task_id: z.string(),
    subtask_id: z.string(),
    media: MediaView.nullable(),
    helper_note: z.string().nullable(),
  }),
  "yikyak.posted": z.object({
    task_id: z.string(),
    subtask_id: z.string(),
    media: MediaView,
    post_text: z.string(),
    posted_at: IsoTime,
  }),
  "pin.failed": z.object({
    task_id: z.string(),
    subtask_id: z.string(),
    attempts: z.number().int(),
    attempts_left: z.number().int(),
  }),
  "pin.locked": z.object({
    task_id: z.string(),
    subtask_id: z.string(),
    attempts: z.number().int(),
  }),
  "subtask.paid": z.object({
    subtask: SubtaskView,
    amount: Money,
    tx_hash: z.string(),
    explorer_url: z.string(),
  }),
  "task.paid": z.object({
    task: TaskView,
    amount: Money,
    tx_hash: z.string(),
    explorer_url: z.string(),
  }),
  "task.failed": z.object({ task: TaskView, reason: z.string() }),
  "agent.log": z.object({ entry: AgentLogEntry }),
} as const;

export type BoardEventType = keyof typeof BoardEventDataSchemas;
export const BOARD_EVENT_TYPES = Object.keys(BoardEventDataSchemas) as BoardEventType[];

export type BoardEventData = {
  [K in BoardEventType]: z.infer<(typeof BoardEventDataSchemas)[K]>;
};

export type BoardEventOf<K extends BoardEventType> = {
  seq: number;
  type: K;
  at: string;
  data: BoardEventData[K];
};

/** Discriminated union of all board events. */
export type BoardEvent = { [K in BoardEventType]: BoardEventOf<K> }[BoardEventType];

export const BoardEventSchema = z.discriminatedUnion(
  "type",
  BOARD_EVENT_TYPES.map((type) =>
    z.object({
      seq: z.number().int(),
      type: z.literal(type),
      at: IsoTime,
      data: BoardEventDataSchemas[type],
    }),
  ) as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
);

/** Sent (without a seq of its own) on connect, and when a reconnecting client is too far behind. */
export const BoardSnapshotMessage = z.object({
  type: z.literal("snapshot"),
  seq: z.number().int(),
  state: BoardState,
});
export type BoardSnapshotMessage = z.infer<typeof BoardSnapshotMessage>;

/** Everything the server sends on /ws/board. */
export type BoardServerMessage = BoardEvent | BoardSnapshotMessage;

export { PIN_MAX_ATTEMPTS };
