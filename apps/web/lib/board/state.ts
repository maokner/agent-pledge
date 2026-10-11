/**
 * The board's client-side state and the pure function that applies each
 * server message to it. Used as a React reducer by useBoard.
 */
import type {
  AgentLogLine,
  BoardServerMessage,
  LedgerTx,
  Subtask,
  SubtaskId,
  Task,
  TaskId,
  TxHash,
} from "@/lib/contract";

export interface BoardState {
  /** seq of the last event applied. 0 before anything arrived. */
  seq: number;
  /**
   * True when the last event showed a gap (its seq was more than seq + 1).
   * The gap event was not applied. The sync layer reconnects with
   * since = seq to fill the gap.
   */
  needsResync: boolean;
  tasks: Record<TaskId, Task>;
  subtasks: Record<SubtaskId, Subtask>;
  txs: Record<TxHash, LedgerTx>;
  /** Oldest first, at most AGENT_LOG_LIMIT lines. */
  agentLog: AgentLogLine[];
}

/** How many agent log lines the board keeps. */
export const AGENT_LOG_LIMIT = 200;

export const initialBoardState: BoardState = {
  seq: 0,
  needsResync: false,
  tasks: {},
  subtasks: {},
  txs: {},
  agentLog: [],
};

export function applyBoardMessage(state: BoardState, message: BoardServerMessage): BoardState {
  if (message.type === "board.snapshot") {
    const { snapshot } = message;
    return {
      seq: snapshot.seq,
      needsResync: false,
      tasks: byKey(snapshot.tasks, (t) => t.id),
      subtasks: byKey(snapshot.subtasks, (s) => s.id),
      txs: byKey(snapshot.txs, (tx) => tx.hash),
      agentLog: snapshot.agent_log.slice(-AGENT_LOG_LIMIT),
    };
  }
  if (message.seq <= state.seq) return state;
  if (message.seq > state.seq + 1) {
    return state.needsResync ? state : { ...state, needsResync: true };
  }
  const next = { ...state, seq: message.seq, needsResync: false };
  switch (message.type) {
    case "task.created":
    case "task.claimed":
      return withTxs(
        withSubtasks(withTasks(next, [message.data.task]), message.data.subtasks ?? []),
        message.data.txs ?? [],
      );
    case "subtask.created":
      return withSubtasks(withTasks(next, [message.data.task]), [message.data.subtask]);
    case "subtask.claimed":
    case "subtask.paid":
    case "photo.added":
    case "yikyak.posted":
    case "pin.failed":
    case "pin.locked":
      return withSubtasks(next, [message.data.subtask]);
    case "task.paid":
    case "task.failed":
      return withTxs(
        withSubtasks(withTasks(next, [message.data.task]), message.data.subtasks),
        message.data.txs ?? [],
      );
    case "tx.pending":
    case "tx.failed":
      return withTxs(next, [message.data.tx]);
    case "tx.validated": {
      const { tx, task, subtask } = message.data;
      return withSubtasks(
        withTasks(withTxs(next, [tx]), task ? [task] : []),
        subtask ? [subtask] : [],
      );
    }
    case "agent.log":
      return { ...next, agentLog: [...state.agentLog, message.data.line].slice(-AGENT_LOG_LIMIT) };
    default:
      // A type this board does not know (a newer server, or one the adapter could not map):
      // skip it, but count its seq, or the next event would look like a gap and force a resync.
      return next;
  }
}

function withTasks(state: BoardState, tasks: Task[]): BoardState {
  if (tasks.length === 0) return state;
  return { ...state, tasks: { ...state.tasks, ...byKey(tasks, (t) => t.id) } };
}

function withSubtasks(state: BoardState, subtasks: Subtask[]): BoardState {
  if (subtasks.length === 0) return state;
  return { ...state, subtasks: { ...state.subtasks, ...byKey(subtasks, (s) => s.id) } };
}

function withTxs(state: BoardState, txs: LedgerTx[]): BoardState {
  if (txs.length === 0) return state;
  return { ...state, txs: { ...state.txs, ...byKey(txs, (tx) => tx.hash) } };
}

function byKey<T>(items: T[], key: (item: T) => string): Record<string, T> {
  return Object.fromEntries(items.map((item) => [key(item), item]));
}
