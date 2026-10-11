// Pure state updates for the board: apply /ws/board events to a BoardState.
// Clients upsert by ID (docs/api.md section 4). Every function returns a new state object.

const byCreatedDesc = (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);
const byCreatedAsc = (a, b) => -byCreatedDesc(a, b);

function upsert(list, item, key, order) {
  const i = list.findIndex((x) => x[key] === item[key]);
  const next = i === -1 ? [...list, item] : list.map((x, j) => (j === i ? item : x));
  return next.sort(order);
}

function updateTask(state, taskId, fn) {
  if (!taskId) return state;
  const tasks = state.tasks.map((t) => (t.id === taskId ? fn(t) : t));
  return { ...state, tasks };
}

function updateSubtask(state, taskId, subtaskId, fn) {
  return updateTask(state, taskId, (t) => ({
    ...t,
    subtasks: t.subtasks.map((s) => (s.id === subtaskId ? fn(s) : s)),
  }));
}

function upsertTask(state, task) {
  return { ...state, tasks: upsert(state.tasks, task, "id", byCreatedDesc) };
}

function upsertSubtask(state, subtask) {
  return updateTask(state, subtask.task_id, (t) => ({
    ...t,
    subtasks: upsert(t.subtasks, subtask, "id", byCreatedAsc),
  }));
}

function upsertTx(state, tx) {
  return updateTask(state, tx.task_id, (t) => ({
    ...t,
    transactions: upsert(t.transactions, tx, "hash", byCreatedAsc),
  }));
}

/** An empty board, used before the first load. */
export const emptyState = () => ({
  seq: 0,
  generated_at: new Date().toISOString(),
  tasks: [],
  agent_log: [],
  vault_address: null,
  agent_address: null,
});

/** Applies one message from /ws/board (a snapshot or an event envelope). */
export function applyMessage(state, msg) {
  if (msg.type === "snapshot") return { ...msg.state, seq: msg.seq };
  const d = msg.data;
  let next = state;
  switch (msg.type) {
    case "task.created":
    case "task.claimed":
    case "task.paid":
    case "task.failed":
      next = upsertTask(state, d.task);
      break;
    case "subtask.created":
    case "subtask.claimed":
    case "subtask.paid":
      next = upsertSubtask(state, d.subtask);
      break;
    case "tx.pending":
    case "tx.validated":
    case "tx.failed":
      next = upsertTx(state, d.tx);
      break;
    case "photo.added":
      next = updateSubtask(state, d.task_id, d.subtask_id, (s) => ({
        ...s,
        photo: d.media ?? s.photo,
        helper_note: d.helper_note ?? s.helper_note,
      }));
      break;
    case "yikyak.posted":
      next = updateSubtask(state, d.task_id, d.subtask_id, (s) => ({
        ...s,
        yikyak_screenshot: d.media,
        post_text: d.post_text,
        yikyak_posted_at: d.posted_at,
      }));
      break;
    case "pin.failed":
      next = updateTask(state, d.task_id, (t) => ({
        ...t,
        pin: { ...t.pin, attempts: d.attempts, attempts_left: d.attempts_left },
      }));
      break;
    case "pin.locked":
      next = updateTask(state, d.task_id, (t) => ({
        ...t,
        pin: { ...t.pin, attempts: d.attempts, attempts_left: 0, locked: true },
      }));
      break;
    case "agent.log":
      if (!state.agent_log.some((e) => e.id === d.entry.id)) {
        next = { ...state, agent_log: [d.entry, ...state.agent_log].slice(0, 200) };
      }
      break;
    default:
      break;
  }
  return typeof msg.seq === "number" ? { ...next, seq: Math.max(next.seq, msg.seq) } : next;
}
