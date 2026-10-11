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

/** Who holds the task NFT right now (PRD 5.3), in plain words for the task card. */
export function taskHolder(task: Task): string {
  switch (task.status) {
    case "open":
      return task.nft_id ? "Vault" : "Vault (minting the NFT)";
    case "claimed":
      return "Local agent";
    case "done":
      return "Nobody: paid out, NFT burned";
    case "failed":
      return "Nobody: refunded, NFT burned";
  }
}

/** Who holds the sub-task NFT right now: open to anyone, or "a helper" (the board never names helpers). */
export function subtaskHolder(subtask: Subtask): string {
  switch (subtask.status) {
    case "open":
      return "Open to anyone";
    case "claimed":
      return "A helper";
    case "done":
      return "A helper (paid)";
    case "failed":
      return subtask.helper_address ? "A helper (not paid)" : "Nobody claimed it";
  }
}

/** Address -> "Requester" | "Vault" | "Local agent" | "Helper", for the transaction list's from and to. */
export function selectPartyNames({ task, subtasks, txs }: TaskView): Map<string, string> {
  const names = new Map<string, string>();
  names.set(task.requester_address, "Requester");
  // The contract has no vault address field; the vault is the escrow payment's
  // destination, or the signer of any NFT mint.
  const vault =
    txs.find((tx) => tx.kind === "task_escrow")?.to ??
    txs.find((tx) => tx.kind === "task_nft_mint" || tx.kind === "subtask_nft_mint")?.from;
  if (vault) names.set(vault, "Vault");
  if (task.agent_address) names.set(task.agent_address, "Local agent");
  for (const sub of subtasks) if (sub.helper_address) names.set(sub.helper_address, "Helper");
  return names;
}

/**
 * The rows a compact transaction list shows (#34): the newest `rows`, plus
 * any older transaction that is still pending, in the original order.
 */
export function compactTxs(txs: LedgerTx[], rows: number): LedgerTx[] {
  const firstNewest = Math.max(0, txs.length - rows);
  return txs.filter((tx, i) => i >= firstNewest || tx.status === "pending");
}

/** The task's own transactions, and each sub-task's, keeping the view's order. */
export function splitTxs({ subtasks, txs }: TaskView): { task: LedgerTx[]; bySubtask: Map<string, LedgerTx[]> } {
  const bySubtask = new Map<string, LedgerTx[]>(subtasks.map((sub) => [sub.id, []]));
  const task: LedgerTx[] = [];
  for (const tx of txs) {
    if (tx.subtask_id === null) {
      task.push(tx);
      continue;
    }
    const list = bySubtask.get(tx.subtask_id) ?? [];
    list.push(tx);
    bySubtask.set(tx.subtask_id, list);
  }
  return { task, bySubtask };
}
