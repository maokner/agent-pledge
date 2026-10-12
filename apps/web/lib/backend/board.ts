/**
 * The real server's board shapes (nested TaskView, snapshot message, patch
 * events) mapped into the board's own types (BoardSnapshot, BoardServerMessage).
 */
import {
  MAX_PIN_ATTEMPTS,
  type AgentLogLevel,
  type AgentLogLine,
  type BoardEvent,
  type BoardServerMessage,
  type BoardSnapshot,
  type FailureReason,
  type LedgerTx,
  type Photo,
  type Subtask,
  type Task,
  type TxKind,
  type TxStatus,
  type XrplTxType,
  type YikYakPost,
} from "@/lib/contract";
import type { BoardState } from "../board/state";
import type {
  BackendAgentLogEntry,
  BackendBoardEvent,
  BackendBoardSnapshotMessage,
  BackendBoardState,
  BackendMediaView,
  BackendPinState,
  BackendSubtaskView,
  BackendTaskView,
  BackendTxView,
} from "./types";

/** GET /board/state, or the `state` of the socket's `{type: "snapshot"}` message. */
export function boardSnapshotFromBackend(
  state: BackendBoardState,
  seq: number = state.seq,
): BoardSnapshot {
  const tasks = state.tasks ?? [];
  return {
    seq,
    generated_at: state.generated_at,
    tasks: tasks.map(taskFromBackend),
    subtasks: tasks.flatMap(subtasksOf),
    txs: tasks.flatMap((task) => txsFromBackend(task.transactions ?? [])),
    // The server sends the newest line first; the board keeps the oldest first.
    agent_log: [...(state.agent_log ?? [])].reverse().map(logLineFromBackend),
  };
}

/**
 * One message from the real server's board socket, as the board's own message.
 *
 * The server's events are patches: a sub-task without its text, a photo
 * without its sub-task, a PIN count without anything else. So this needs the
 * board state the message will apply to, and fills in the rest from it.
 *
 * - `{type: "snapshot"}` becomes a `board.snapshot` (the reducer resets on it).
 * - An event it cannot apply (an unknown type, or a patch for a sub-task the
 *   board does not have) becomes a message of a type the reducer does not know,
 *   which the reducer skips while still counting its seq.
 * - Something that is not a message at all (no type or no seq) returns null.
 */
export function boardMessageFromBackend(
  wire: unknown,
  state: BoardState,
): BoardServerMessage | null {
  if (!isRecord(wire) || typeof wire.type !== "string") return null;
  if (wire.type === "snapshot") {
    const message = wire as unknown as BackendBoardSnapshotMessage;
    if (!isRecord(message.state)) return null;
    return {
      type: "board.snapshot",
      snapshot: boardSnapshotFromBackend(message.state, message.seq ?? message.state.seq),
    };
  }
  if (typeof wire.seq !== "number" || !isRecord(wire.data)) return null;
  return (
    eventFromBackend(wire as unknown as BackendBoardEvent, state) ??
    skipped(wire.seq, wire.at, wire.type)
  );
}

function eventFromBackend(event: BackendBoardEvent, state: BoardState): BoardEvent | null {
  const { seq, at } = event;
  switch (event.type) {
    case "task.created":
    case "task.claimed": {
      const { task, subtasks, txs } = taskParts(event.data.task);
      return { type: event.type, seq, at, data: { task, subtasks, txs } };
    }
    case "task.paid":
    case "task.failed":
      return { type: event.type, seq, at, data: taskParts(event.data.task) };
    case "subtask.created": {
      const parent = state.tasks[event.data.subtask.task_id];
      if (!parent) return null;
      const subtask = subtaskFromBackend(event.data.subtask, parent);
      const task = parent.subtask_ids.includes(subtask.id)
        ? parent
        : { ...parent, subtask_ids: [...parent.subtask_ids, subtask.id] };
      return { type: "subtask.created", seq, at, data: { subtask, task } };
    }
    case "subtask.claimed":
    case "subtask.paid": {
      const subtask = refreshSubtask(event.data.subtask, state);
      return subtask && { type: event.type, seq, at, data: { subtask } };
    }
    case "tx.pending":
    case "tx.failed": {
      const tx = txFromBackend(event.data.tx);
      return tx && { type: event.type, seq, at, data: { tx } };
    }
    case "tx.validated": {
      const tx = txFromBackend(event.data.tx);
      return tx && { type: "tx.validated", seq, at, data: { tx, task: null, subtask: null } };
    }
    case "photo.added": {
      const { subtask_id, media, helper_note } = event.data;
      return patchSubtask(state, subtask_id, (sub) => {
        const photo = media
          ? photoFrom(media, helper_note)
          : sub.photo && { ...sub.photo, note: helper_note ?? sub.photo.note };
        return { type: "photo.added", seq, at, data: { subtask: { ...sub, photo } } };
      });
    }
    case "yikyak.posted": {
      const { subtask_id, media, post_text, posted_at } = event.data;
      return patchSubtask(state, subtask_id, (sub) => ({
        type: "yikyak.posted",
        seq,
        at,
        data: {
          subtask: {
            ...sub,
            yikyak_post: { text: post_text, screenshot_url: media.url, posted_at },
          },
        },
      }));
    }
    case "pin.failed": {
      const { subtask_id, attempts_left } = event.data;
      return patchSubtask(state, subtask_id, (sub) => ({
        type: "pin.failed",
        seq,
        at,
        data: { subtask: { ...sub, pin_attempts_left: attempts_left } },
      }));
    }
    case "pin.locked":
      return patchSubtask(state, event.data.subtask_id, (sub) => ({
        type: "pin.locked",
        seq,
        at,
        data: { subtask: { ...sub, pin_attempts_left: 0, pin_locked: true } },
      }));
    case "agent.log":
      return { type: "agent.log", seq, at, data: { line: logLineFromBackend(event.data.entry) } };
    default:
      return null;
  }
}

/** A full TaskView as the task, its sub-tasks and its transactions. */
function taskParts(view: BackendTaskView): { task: Task; subtasks: Subtask[]; txs: LedgerTx[] } {
  return {
    task: taskFromBackend(view),
    subtasks: subtasksOf(view),
    txs: txsFromBackend(view.transactions ?? []),
  };
}

/** A whole SubtaskView from an event, with the text and PIN state the board already has for it. */
function refreshSubtask(view: BackendSubtaskView, state: BoardState): Subtask | null {
  const known = state.subtasks[view.id];
  const parent: SubtaskParent | undefined =
    state.tasks[view.task_id] ??
    (known && {
      description: known.description,
      place: known.place,
      nft_id: known.parent_nft_id,
      failure_reason: known.failure_reason,
    });
  if (!parent) return null;
  const pin = known
    ? { pin_attempts_left: known.pin_attempts_left, pin_locked: known.pin_locked }
    : DEFAULT_PIN;
  return subtaskFromBackend(view, parent, pin);
}

function patchSubtask(
  state: BoardState,
  id: string,
  patch: (sub: Subtask) => BoardEvent,
): BoardEvent | null {
  const sub = state.subtasks[id];
  return sub ? patch(sub) : null;
}

/**
 * A message the reducer does not know, so it skips it but still counts its seq.
 * Its type keeps the server's, prefixed, for debugging.
 */
function skipped(seq: number, at: unknown, type: string): BoardServerMessage {
  return {
    type: `skipped:${type}`,
    seq,
    at: typeof at === "string" ? at : "",
    data: null,
  } as unknown as BoardServerMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/* ---------- entities ---------- */

export function taskFromBackend(task: BackendTaskView): Task {
  return {
    id: task.id,
    kind: "seat_hold",
    description: task.description,
    place: task.place,
    time_limit_minutes: task.time_limit_minutes,
    price: task.price,
    pledge: task.pledge,
    status: task.status,
    created_at: task.created_at,
    deadline_at: task.deadline,
    claimed_at: task.claimed_at,
    finished_at: task.done_at ?? task.failed_at,
    requester_address: task.requester_address ?? "",
    agent_address: task.agent_address,
    nft_id: task.nft_id,
    subtask_ids: (task.subtasks ?? []).map((sub) => sub.id),
    failure_reason: task.status === "failed" ? failureReasonFrom(task.fail_reason, task.pin) : null,
    fail_reason: task.fail_reason,
    nft_explorer_url: task.nft_explorer_url,
  };
}

/** A task's sub-tasks, each filled in from the task. */
export function subtasksOf(task: BackendTaskView): Subtask[] {
  const parent = taskFromBackend(task);
  return (task.subtasks ?? []).map((sub) => subtaskFromBackend(sub, parent, pinFields(task.pin)));
}

/** What a sub-task takes from its parent task: the text, the place, the task NFT and why it failed. */
export type SubtaskParent = Pick<Task, "description" | "place" | "nft_id" | "failure_reason">;

export type PinFields = Pick<Subtask, "pin_attempts_left" | "pin_locked">;

/** The server's sub-task has no description, place or PIN state: they live on the parent task. */
export function subtaskFromBackend(
  sub: BackendSubtaskView,
  parent: SubtaskParent,
  pin: PinFields = DEFAULT_PIN,
): Subtask {
  return {
    id: sub.id,
    task_id: sub.task_id,
    claim_code: sub.claim_code,
    claim_url: sub.claim_url,
    description: parent.description,
    place: parent.place,
    time_limit_minutes: minutesBetween(sub.created_at, sub.deadline),
    price: sub.price,
    status: sub.status,
    created_at: sub.created_at,
    deadline_at: sub.deadline,
    claimed_at: sub.claimed_at,
    finished_at: sub.done_at ?? sub.failed_at,
    nft_id: sub.nft_id,
    parent_nft_id: parent.nft_id,
    helper_address: sub.helper_address,
    photo: photoFrom(sub.photo, sub.helper_note),
    yikyak_post: yikyakFrom(sub),
    ...pin,
    failure_reason: sub.status === "failed" ? parent.failure_reason : null,
    nft_explorer_url: sub.nft_explorer_url,
  };
}

/** Transactions the board can place: ones with a task and a kind it knows. */
export function txsFromBackend(txs: BackendTxView[]): LedgerTx[] {
  return txs.flatMap((tx) => txFromBackend(tx) ?? []);
}

/** Null for a transaction that belongs to no task (a pooled helper wallet's setup) or has a kind the board does not know. */
export function txFromBackend(tx: BackendTxView): LedgerTx | null {
  const kind = txKindFromBackend(tx.kind);
  if (!kind || !tx.task_id) return null;
  const status = txStatusFromBackend(tx.status);
  return {
    hash: tx.hash,
    kind,
    tx_type: TX_TYPE[kind],
    task_id: tx.task_id,
    subtask_id: tx.subtask_id,
    from: tx.from ?? "",
    to: tx.to,
    // The board shows amounts as dollars, so it leaves out XRP (wallet setup).
    amount: tx.currency === "XRP" ? null : tx.amount,
    status,
    engine_result: status === "validated" ? "tesSUCCESS" : status === "failed" ? tx.error : null,
    ledger_index: null,
    submitted_at: tx.created_at,
    validated_at: tx.validated_at,
    explorer_url: tx.explorer_url,
    currency: tx.currency,
    error: tx.error,
  };
}

/** The server's tx kind as the web app's, or null for a kind it does not know. */
export function txKindFromBackend(kind: string): TxKind | null {
  return TX_KIND[kind] ?? null;
}

/** The server's tx status; anything unknown reads as pending. */
export function txStatusFromBackend(status: string): TxStatus {
  return TX_STATUSES.has(status) ? (status as TxStatus) : "pending";
}

export function logLineFromBackend(entry: BackendAgentLogEntry): AgentLogLine {
  return {
    id: String(entry.id),
    at: entry.at,
    task_id: entry.task_id,
    subtask_id: entry.subtask_id,
    level: LOG_LEVELS.has(entry.level) ? entry.level : "info",
    message: entry.message,
  };
}

export function photoFrom(media: BackendMediaView | null, note: string | null): Photo | null {
  if (!media) return null;
  return {
    url: media.url,
    note,
    added_at: media.created_at,
    width: media.width,
    height: media.height,
  };
}

export function pinFields(pin: BackendPinState): PinFields {
  return { pin_attempts_left: pin.attempts_left, pin_locked: pin.locked };
}

/** The server's free-text reason (services/settlement.ts deadlineReason, services/tasks.ts) as the board's enum. */
export function failureReasonFrom(
  reason: string | null,
  pin?: BackendPinState,
): FailureReason | null {
  if (pin?.locked) return "pin_locked";
  if (!reason) return null;
  const text = reason.toLowerCase();
  if (text.includes("no helper claimed")) return "no_claim_in_time";
  if (text.includes("no correct pin")) return "no_pin_in_time";
  if (text.includes("ledger")) return "ledger_error";
  return null;
}

/* ---------- internals ---------- */

const DEFAULT_PIN: PinFields = { pin_attempts_left: MAX_PIN_ATTEMPTS, pin_locked: false };

/** The server's tx kind names (packages/shared/src/domain.ts) -> the board's. */
const TX_KIND: Record<string, TxKind | undefined> = {
  wallet_setup: "wallet_setup",
  requester_funding: "requester_funding",
  task_funding: "task_escrow",
  task_nft_mint: "task_nft_mint",
  task_offer: "task_nft_offer",
  task_claim: "task_claim",
  subtask_funding: "subtask_escrow",
  subtask_nft_mint: "subtask_nft_mint",
  subtask_offer: "subtask_nft_offer",
  subtask_claim: "subtask_claim",
  helper_redeem_offer: "helper_payout_offer",
  helper_payout: "helper_payout",
  agent_redeem_offer: "agent_payout_offer",
  agent_payout: "agent_payout",
  task_nft_burn: "nft_burn",
  subtask_nft_burn: "nft_burn",
  refund_requester: "requester_refund",
  refund_agent: "agent_refund",
};

/** The XRPL transaction type behind each kind (the server does not send it). */
const TX_TYPE: Record<TxKind, XrplTxType> = {
  wallet_setup: "TrustSet",
  requester_funding: "Payment",
  task_escrow: "Payment",
  task_nft_mint: "NFTokenMint",
  task_nft_offer: "NFTokenCreateOffer",
  task_claim: "NFTokenAcceptOffer",
  subtask_escrow: "Payment",
  subtask_nft_mint: "NFTokenMint",
  subtask_nft_offer: "NFTokenCreateOffer",
  subtask_claim: "NFTokenAcceptOffer",
  helper_payout_offer: "NFTokenCreateOffer",
  helper_payout: "NFTokenAcceptOffer",
  agent_payout_offer: "NFTokenCreateOffer",
  agent_payout: "NFTokenAcceptOffer",
  nft_burn: "NFTokenBurn",
  requester_refund: "Payment",
  agent_refund: "Payment",
};

const TX_STATUSES: ReadonlySet<string> = new Set<TxStatus>(["pending", "validated", "failed"]);
const LOG_LEVELS: ReadonlySet<string> = new Set<AgentLogLevel>([
  "info",
  "decision",
  "warning",
  "error",
]);

function yikyakFrom(sub: BackendSubtaskView): YikYakPost | null {
  if (!sub.yikyak_screenshot) return null;
  return {
    text: sub.post_text ?? "",
    screenshot_url: sub.yikyak_screenshot.url,
    posted_at: sub.yikyak_posted_at ?? sub.yikyak_screenshot.created_at,
  };
}

/** Whole minutes from `from` to `to`, rounded up, at least 1. */
function minutesBetween(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 60_000)) : 1;
}
