/**
 * The numbers in the /human stats band, from the board snapshot
 * (getApiClient().getBoardState()).
 *
 * - openNow: sub-tasks with status "open" whose deadline is after `now`.
 * - paidOutToday: the sum of Helper payouts (kind "helper_payout") that went
 *   through (status "validated") since `dayStart`, as a dollar amount like "8.80".
 * - helpersPaid: how many sub-tasks had their Helper paid since `dayStart`
 *   (distinct sub-tasks among those payouts). The server makes a fresh account
 *   for each claim, so this is also the number of Helpers paid.
 */
import type { BoardSnapshot, RlusdAmount } from "@agent-pledge/shared";

export interface HumanStats {
  openNow: number;
  paidOutToday: RlusdAmount;
  helpersPaid: number;
}

const DECIMAL = /^\d+(\.\d+)?$/;

/** `now` is the server's clock if known (ms); `dayStart` is when "today" began (see startOfLocalDay). */
export function humanStats(board: BoardSnapshot, { now, dayStart }: { now: number; dayStart: number }): HumanStats {
  const openNow = board.subtasks.filter((s) => s.status === "open" && Date.parse(s.deadline_at) > now).length;

  const payouts = board.txs.filter(
    (tx) =>
      tx.kind === "helper_payout" &&
      tx.status === "validated" &&
      tx.validated_at !== null &&
      Date.parse(tx.validated_at) >= dayStart,
  );
  // Whole cents, so 0.1 + 0.2 is 0.30.
  const cents = payouts.reduce((sum, tx) => {
    const amount = tx.amount?.trim() ?? "";
    return DECIMAL.test(amount) ? sum + Math.round(Number(amount) * 100) : sum;
  }, 0);
  const helpersPaid = new Set(payouts.map((tx) => tx.subtask_id ?? tx.hash)).size;

  return { openNow, paidOutToday: (cents / 100).toFixed(2), helpersPaid };
}

/** Local midnight at the start of the day that `now` (ms) falls in. */
export function startOfLocalDay(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
