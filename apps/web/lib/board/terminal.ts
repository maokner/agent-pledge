/**
 * Pure helpers for the board's terminal look (docs/design/agent-design-system.md).
 */
import type { LedgerTx, TxKind, WorkStatus } from "@agent-pledge/shared";
import type { EdgeState } from "./money-tree";

/** The board status map's keys; each has a `term-status-*` color token. */
export type TermTone = "open" | "claimed" | "done" | "failed" | "pending" | "validated" | "refund";

/** A status as text, so it never relies on color alone: `[ERR] FAILED`. */
export interface TermTag {
  tag: string;
  /** Shown after the tag, or null. */
  word: string | null;
  tone: TermTone;
}

const WORK_TAG: Record<WorkStatus, TermTag> = {
  open: { tag: "[OPEN]", word: null, tone: "open" },
  claimed: { tag: "[CLAIMED]", word: null, tone: "claimed" },
  done: { tag: "[DONE]", word: null, tone: "done" },
  failed: { tag: "[ERR]", word: "FAILED", tone: "failed" },
};

/** A task's or sub-task's status tag. */
export function workTag(status: WorkStatus): TermTag {
  return WORK_TAG[status];
}

const REFUND_KINDS: ReadonlySet<TxKind> = new Set(["requester_refund", "agent_refund"]);

/** A ledger transaction's status tag; a validated refund gets `[RFND] ↩`. */
export function txTag(tx: Pick<LedgerTx, "status" | "kind">): TermTag {
  switch (tx.status) {
    case "pending":
      return { tag: "[..]", word: "PENDING", tone: "pending" };
    case "failed":
      return { tag: "[ERR]", word: "FAILED", tone: "failed" };
    case "validated":
      return REFUND_KINDS.has(tx.kind) ? { tag: "[RFND]", word: "↩", tone: "refund" } : { tag: "[OK]", word: null, tone: "validated" };
  }
}

/** A money-tree edge's tag; "planned" (not on the ledger yet) is drawn dashed and dim. */
export interface EdgeTag extends Omit<TermTag, "tone"> {
  tone: TermTone | "planned";
}

const EDGE_TAG: Record<EdgeState, EdgeTag> = {
  planned: { tag: "[--]", word: null, tone: "planned" },
  pending: { tag: "[..]", word: null, tone: "pending" },
  settled: { tag: "[HELD]", word: null, tone: "claimed" },
  paid: { tag: "[OK]", word: null, tone: "validated" },
  returned: { tag: "[RFND]", word: "↩", tone: "refund" },
  failed: { tag: "[ERR]", word: null, tone: "failed" },
};

/** A money-tree edge's state as text: `[HELD]` in the vault, `[OK]` paid, `[RFND] ↩` returned. */
export function edgeTag(state: EdgeState): EdgeTag {
  return EDGE_TAG[state];
}

/** The share of a time limit still left before `deadline`; 1 before the clock starts. */
export function timeLeftFraction(deadline: string, limitMinutes: number, now: number | null): number {
  if (now === null) return 1;
  const left = (Date.parse(deadline) - now) / (limitMinutes * 60_000);
  return Number.isFinite(left) ? Math.min(1, Math.max(0, left)) : 0;
}

/** An ASCII progress bar: `asciiBar(0.375, 8)` -> "[|||.....]". */
export function asciiBar(fraction: number, width: number): string {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : fraction > 0 ? 1 : 0;
  const filled = Math.round(clamped * width);
  return `[${"|".repeat(filled)}${".".repeat(width - filled)}]`;
}

/**
 * Breaks a long unbreakable line (a hash, an address) into lines of at most
 * `width` characters, each wrapped line ending in a `\` continuation marker.
 */
export function wrapWithContinuation(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const step = Math.max(1, width - 1);
  const lines: string[] = [];
  let rest = text;
  while (rest.length > width) {
    lines.push(`${rest.slice(0, step)}\\`);
    rest = rest.slice(step);
  }
  lines.push(rest);
  return lines;
}

/** How long a ledger usually takes to validate a transaction. */
const LEDGER_CLOSE_MS = 4000;
/** A pending bar never fills: only a validated transaction shows a full bar. */
const PENDING_MAX = 0.9;

/**
 * How full a pending transaction's bar is: time since it was submitted over
 * the usual ledger close time, held below full until it validates.
 * `now` is null before the clock starts (first render).
 */
export function pendingFraction(submittedAt: string, now: number | null): number {
  const start = Date.parse(submittedAt);
  if (now === null || Number.isNaN(start)) return 0;
  return Math.min(PENDING_MAX, Math.max(0, (now - start) / LEDGER_CLOSE_MS));
}
