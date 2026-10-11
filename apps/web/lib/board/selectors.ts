/** Read-only views over BoardState for the board components. */
import type { LedgerTx, Subtask, Task } from "@agent-pledge/shared";
import type { BoardState } from "./state";

/** One task card with everything under it. */
export interface TaskView {
  task: Task;
  /** In the task's subtask_ids order. */
  subtasks: Subtask[];
  /** All transactions for the task and its sub-tasks, oldest first. */
  txs: LedgerTx[];
}

/** Tasks newest first. */
export function selectTaskViews(state: BoardState): TaskView[] {
  const txsByTask = new Map<string, LedgerTx[]>();
  for (const tx of Object.values(state.txs)) {
    const list = txsByTask.get(tx.task_id) ?? [];
    list.push(tx);
    txsByTask.set(tx.task_id, list);
  }

  return Object.values(state.tasks)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((task) => ({
      task,
      subtasks: task.subtask_ids.flatMap((id) => state.subtasks[id] ?? []),
      txs: (txsByTask.get(task.id) ?? []).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)),
    }));
}
