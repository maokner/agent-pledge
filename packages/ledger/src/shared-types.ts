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
  | "refund"
  /** A plain token payment, for example from a treasury into a new requester wallet. */
  | "token.transfer";

/** Input to the voice agent's create_task tool. PRD section 6. */
export interface CreateTaskInput {
  description: string;
  place: string;
  time_limit_minutes: number;
  price_usd: number;
  caller_phone: string;
  /**
   * The ElevenLabs conversation id (system__conversation_id), used to dedupe retries.
   * The server returns the existing task for a repeated call_id instead of creating a new one.
   * Absent or empty when the request does not come from a call, for example from the board's web form.
   */
  call_id?: string;
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

/** Stable error codes on `LedgerError.code` from `@agent-pledge/ledger`. See packages/ledger/README.md. */
export type LedgerErrorCode =
  | "ALREADY_CLAIMED"
  | "INSUFFICIENT_FUNDS"
  | "NETWORK"
  | "NO_TRUST_LINE"
  | "NOT_ALLOWED"
  | "NOT_FOUND"
  | "OFFER_EXPIRED"
  | "TX_EXPIRED"
  | "INVALID_TX"
  | "INVALID_INPUT"
  | "CONFIG"
  | "TX_FAILED"
  // Codes from the task ops (packages/ledger/src/ops).
  /** failTask: a task or sub-task NFT was already paid out, so the task did not fail. */
  | "ALREADY_PAID_OUT"
  /** failTask: an NFT is not burned and none of the candidate accounts holds it. */
  | "NFT_HOLDER_UNKNOWN"
  /** A validated transaction's metadata has no NFT ID or offer ID. */
  | "META_PARSE"
  /** failTask: the caller's amounts differ from what the vault received on the ledger. */
  | "FUNDING_MISMATCH"
  /** acceptPayoutOffer: the offer on the ledger is not the expected payout offer. */
  | "OFFER_MISMATCH"
  /** failTask: the XRPL server does not have the vault's full history. */
  | "HISTORY_INCOMPLETE";

/** Fields that every ledger transaction event has. */
export interface LedgerTxEventBase {
  /** Transaction hash. Known as soon as the transaction is signed. */
  hash: string;
  /** Board meaning of the transaction. `null` when the caller did not tag it. */
  kind: TxKind | null;
  /** XRPL transaction type, for example `NFTokenAcceptOffer`. */
  txType: string;
  /** Address that signed the transaction. */
  account: string;
  /** Task ID from the transaction memo, or `null` when it has no task memo. */
  taskId: string | null;
}

/** Emitted when a signed transaction is sent to the network. The board shows "pending". */
export interface TxPendingEvent extends LedgerTxEventBase {
  explorerUrl: string;
}

/** Emitted when a validated ledger includes the transaction with `tesSUCCESS`. */
export interface TxValidatedEvent extends LedgerTxEventBase {
  explorerUrl: string;
  /** Always `tesSUCCESS`. Other results emit `tx.failed`. */
  result: string;
  ledgerIndex: number;
}

/** Emitted when the transaction fails, before or after it reaches a ledger. It did not apply. */
export interface TxFailedEvent extends LedgerTxEventBase {
  /** Raw XRPL result code (for example `tecOBJECT_NOT_FOUND`), or the `errorCode` when there is none. */
  code: string;
  /** Stable error code of the `LedgerError` that `submitTx` throws. */
  errorCode: LedgerErrorCode;
  message: string;
  /** Explorer link when the transaction is in a validated ledger (`tec` codes), otherwise `null`. */
  explorerUrl: string | null;
}

/**
 * Emitted when `submitTx` cannot learn the outcome of a signed transaction, for example because the
 * connection stayed down past the deadline. The transaction may still validate and move money, so
 * do not show it as failed. Look up the hash (`explorerUrl`) before you build it again.
 */
export interface TxUnknownEvent extends LedgerTxEventBase {
  /** Stable error code of the `LedgerError` that `submitTx` throws. Always `NETWORK`. */
  errorCode: LedgerErrorCode;
  message: string;
  /** Explorer link for the hash. It shows the transaction only if it validated. */
  explorerUrl: string;
}

/** Emitted when the XRPL WebSocket drops unexpectedly. The package reconnects by itself. */
export interface LedgerDisconnectedEvent {
  url: string;
  /** WebSocket close code. */
  code: number;
}

/** Emitted after the package connects or reconnects to the XRPL. */
export interface LedgerConnectedEvent {
  url: string;
  /** `true` when this connection replaces one that dropped. */
  reconnected: boolean;
}

/** Event name to payload. The server forwards the `tx.*` events to the board over its WebSocket. */
export interface LedgerEventMap {
  "tx.pending": TxPendingEvent;
  "tx.validated": TxValidatedEvent;
  "tx.failed": TxFailedEvent;
  "tx.unknown": TxUnknownEvent;
  "ledger.connected": LedgerConnectedEvent;
  "ledger.disconnected": LedgerDisconnectedEvent;
}

export type LedgerEventName = keyof LedgerEventMap;
