/**
 * Types shared by the server, the board, the local agent, the ledger package, and the voice agent.
 * Keep this file free of runtime dependencies.
 */

export type TaskStatus = "open" | "claimed" | "done" | "failed";

export type WalletRole = "requester" | "helper" | "agent" | "vault";

export type TxStatus = "pending" | "validated" | "failed";

/** Kinds of ledger transactions the board shows. Mirrors PRD section 5.4. */
export type TxKind =
  | "task.fund"
  | "task.mint"
  | "task.offer"
  | "task.claim"
  | "subtask.fund"
  | "subtask.mint"
  | "subtask.offer"
  | "subtask.claim"
  | "payout.offer"
  | "payout.accept"
  | "nft.burn"
  | "refund";

/** Input to the voice agent's create_task tool. PRD section 6. */
export interface CreateTaskInput {
  description: string;
  place: string;
  time_limit_minutes: number;
  price_usd: number;
  caller_phone: string;
}

/** Output of the voice agent's create_task tool. PRD section 6. */
export interface CreateTaskOutput {
  task_id: string;
  pin: string;
  board_url: string;
}

/** Output of the voice agent's task_status tool. PRD section 6. */
export interface TaskStatusOutput {
  status: TaskStatus;
  helper_note: string | null;
}

/** Data behind an NFT URI. Sub-tasks carry parent_nft_id so the money tree can be drawn from the ledger. */
export interface NftMetadata {
  kind: "task" | "subtask";
  id: string;
  description: string;
  place: string;
  price_usd: number;
  deadline: string;
  parent_nft_id?: string;
}
