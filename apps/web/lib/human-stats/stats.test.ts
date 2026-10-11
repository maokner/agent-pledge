import type { BoardSnapshot, LedgerTx, Subtask, TxKind, TxStatus } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import { humanStats, startOfLocalDay } from "./stats";

const NOW = Date.parse("2026-10-11T19:00:00.000Z");
/** "Midnight" for these tests: 10 hours before NOW. */
const DAY_START = NOW - 10 * 60 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

function subtask(id: string, status: Subtask["status"], deadlineFromNow: number): Subtask {
  return {
    id,
    task_id: `tsk_${id}`,
    claim_code: id.slice(-4).toUpperCase(),
    claim_url: `https://example.test/c/${id}`,
    description: "Save a seat",
    place: "Main Stacks",
    time_limit_minutes: 10,
    price: "4",
    status,
    created_at: iso(NOW - 5 * MIN),
    deadline_at: iso(NOW + deadlineFromNow),
    claimed_at: null,
    finished_at: null,
    nft_id: null,
    parent_nft_id: null,
    helper_address: null,
    photo: null,
    yikyak_post: null,
    pin_attempts_left: 3,
    pin_locked: false,
    failure_reason: null,
  };
}

function tx(
  hash: string,
  { kind = "helper_payout", status = "validated", amount = "4", at = NOW - MIN, subtaskId = "sub_1" }: {
    kind?: TxKind;
    status?: TxStatus;
    amount?: string | null;
    at?: number;
    subtaskId?: string | null;
  } = {},
): LedgerTx {
  return {
    hash,
    kind,
    tx_type: "NFTokenAcceptOffer",
    task_id: "tsk_1",
    subtask_id: subtaskId,
    from: "rVault",
    to: "rHelper",
    amount,
    status,
    engine_result: status === "validated" ? "tesSUCCESS" : null,
    ledger_index: status === "validated" ? 1 : null,
    submitted_at: iso(at - 4000),
    validated_at: status === "validated" ? iso(at) : null,
  };
}

function snapshot({ subtasks = [], txs = [] }: { subtasks?: Subtask[]; txs?: LedgerTx[] }): BoardSnapshot {
  return { seq: 1, generated_at: iso(NOW), tasks: [], subtasks, txs, agent_log: [] };
}

describe("humanStats", () => {
  it("counts the open sub-tasks whose time is not up", () => {
    const board = snapshot({
      subtasks: [
        subtask("sub_a", "open", 5 * MIN),
        subtask("sub_b", "open", 30 * MIN),
        subtask("sub_c", "open", -1000),
        subtask("sub_d", "claimed", 5 * MIN),
        subtask("sub_e", "done", 5 * MIN),
      ],
    });
    expect(humanStats(board, { now: NOW, dayStart: DAY_START }).openNow).toBe(2);
  });

  it("adds up today's Helper payouts that went through, in dollars", () => {
    const board = snapshot({
      txs: [
        tx("a", { amount: "4", subtaskId: "sub_1" }),
        tx("b", { amount: "4.5", subtaskId: "sub_2" }),
        tx("c", { amount: "0.1", subtaskId: "sub_3" }),
        tx("d", { amount: "0.2", subtaskId: "sub_4" }),
      ],
    });
    expect(humanStats(board, { now: NOW, dayStart: DAY_START })).toMatchObject({ paidOutToday: "8.80", helpersPaid: 4 });
  });

  it("leaves out payouts from before midnight, pending or failed ones, and other kinds of payment", () => {
    const board = snapshot({
      txs: [
        tx("today", { amount: "4" }),
        tx("yesterday", { amount: "9", at: DAY_START - 1000, subtaskId: "sub_old" }),
        tx("pending", { amount: "9", status: "pending", subtaskId: "sub_p" }),
        tx("failed", { amount: "9", status: "failed", subtaskId: "sub_f" }),
        tx("agent", { amount: "9", kind: "agent_payout", subtaskId: null }),
        tx("escrow", { amount: "9", kind: "subtask_escrow", subtaskId: "sub_e" }),
      ],
    });
    expect(humanStats(board, { now: NOW, dayStart: DAY_START })).toMatchObject({ paidOutToday: "4.00", helpersPaid: 1 });
  });

  it("counts each paid sub-task once, and skips a malformed amount without breaking the total", () => {
    const board = snapshot({
      txs: [tx("a", { amount: "4", subtaskId: "sub_1" }), tx("b", { amount: "oops", subtaskId: "sub_1" }), tx("c", { amount: null, subtaskId: "sub_2" })],
    });
    expect(humanStats(board, { now: NOW, dayStart: DAY_START })).toMatchObject({ paidOutToday: "4.00", helpersPaid: 2 });
  });

  it("says zero for a quiet board", () => {
    expect(humanStats(snapshot({}), { now: NOW, dayStart: DAY_START })).toEqual({
      openNow: 0,
      paidOutToday: "0.00",
      helpersPaid: 0,
    });
  });
});

describe("startOfLocalDay", () => {
  it("is local midnight of the same day", () => {
    expect(startOfLocalDay(new Date(2026, 9, 11, 14, 30, 5).getTime())).toBe(new Date(2026, 9, 11).getTime());
    expect(startOfLocalDay(new Date(2026, 9, 11).getTime())).toBe(new Date(2026, 9, 11).getTime());
  });
});
