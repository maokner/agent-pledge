import { describe, expect, it } from "vitest";
import { applyBoardMessage, initialBoardState, type BoardState } from "../board/state";
import { boardMessageFromBackend } from "./board";
import {
  ADDRESSES,
  backendBoardState,
  backendLogEntry,
  backendMedia,
  backendSubtask,
  backendTask,
  backendTx,
  hash,
} from "./test-payloads";
import type { BackendBoardServerMessage } from "./types";

const SEQ = 1760205600000;
const AT = "2026-10-11T18:00:00.000Z";

/** Feeds real-server messages through the adapter and the board's reducer, like the sync layer does. */
function play(messages: BackendBoardServerMessage[], start: BoardState = initialBoardState): BoardState {
  return messages.reduce((state, wire) => {
    const message = boardMessageFromBackend(wire, state);
    return message ? applyBoardMessage(state, message) : state;
  }, start);
}

function ev<T extends BackendBoardServerMessage["type"]>(
  seq: number,
  type: T,
  data: Extract<BackendBoardServerMessage, { type: T }> extends { data: infer D } ? D : never,
): BackendBoardServerMessage {
  return { seq, type, at: AT, data } as BackendBoardServerMessage;
}

const task = backendTask();
const sub = backendSubtask();
const snapshot = (tasks = [task]) => ({ type: "snapshot" as const, seq: SEQ, state: backendBoardState({ seq: SEQ, tasks }) });

describe("boardMessageFromBackend + applyBoardMessage", () => {
  it("treats the server's {type: 'snapshot'} as a reset, even to a lower seq after a restart", () => {
    const before = play([snapshot(), ev(SEQ + 1, "task.created", { task: backendTask({ id: "task_other00000000000" }) })]);

    const after = play([{ type: "snapshot", seq: 5, state: backendBoardState({ seq: 5, tasks: [task] }) }], before);

    expect(after.seq).toBe(5);
    expect(Object.keys(after.tasks)).toEqual([task.id]);
    expect(after.needsResync).toBe(false);
  });

  it("upserts a task sent twice by task.created, the second time with its NFT and transactions", () => {
    const withNft = backendTask({
      nft_id: "TASKNFT",
      offer_id: "OFFER",
      transactions: [backendTx({ hash: hash(1), kind: "task_funding" }), backendTx({ hash: hash(2), kind: "task_nft_mint", amount: null })],
    });

    const state = play([snapshot([]), ev(SEQ + 1, "task.created", { task }), ev(SEQ + 2, "task.created", { task: withNft })]);

    expect(state.seq).toBe(SEQ + 2);
    expect(Object.values(state.tasks)).toHaveLength(1);
    expect(state.tasks[task.id]?.nft_id).toBe("TASKNFT");
    expect(Object.keys(state.txs)).toEqual([hash(1), hash(2)]);
  });

  it("builds a new sub-task's text and place from its parent task, and adds it to the parent", () => {
    const state = play([snapshot(), ev(SEQ + 1, "subtask.created", { subtask: sub })]);

    expect(state.subtasks[sub.id]).toMatchObject({
      description: "Save me a seat at the front table",
      place: "Main Stacks",
      price: "4.00",
      claim_code: "7Q2K",
      pin_attempts_left: 3,
      pin_locked: false,
    });
    expect(state.tasks[task.id]?.subtask_ids).toEqual([sub.id]);
  });

  it("applies tx.pending, tx.validated and tx.failed to one row by hash", () => {
    const pending = backendTx({ hash: hash(7), kind: "subtask_claim", subtask_id: sub.id, status: "pending", validated_at: null });

    const validated = play([snapshot(), ev(SEQ + 1, "tx.pending", { tx: pending }), ev(SEQ + 2, "tx.validated", { tx: { ...pending, status: "validated" } })]);
    const failed = play([snapshot(), ev(SEQ + 1, "tx.pending", { tx: pending }), ev(SEQ + 2, "tx.failed", { tx: { ...pending, status: "failed", error: "tecNO_ENTRY" } })]);

    expect(validated.txs[hash(7)]).toMatchObject({ kind: "subtask_claim", status: "validated" });
    expect(failed.txs[hash(7)]).toMatchObject({ status: "failed", error: "tecNO_ENTRY" });
    expect(failed.seq).toBe(SEQ + 2);
  });

  it("patches the photo and note onto the sub-task it has", () => {
    const claimed = backendSubtask({ status: "claimed", helper_address: ADDRESSES.helper });
    const photo = backendMedia();

    const state = play([
      snapshot([backendTask({ status: "claimed", subtasks: [claimed] })]),
      ev(SEQ + 1, "photo.added", { task_id: task.id, subtask_id: sub.id, media: photo, helper_note: "Front table, left side" }),
    ]);

    expect(state.subtasks[sub.id]).toMatchObject({
      status: "claimed",
      helper_address: ADDRESSES.helper,
      photo: { url: "http://localhost:3001/media/med_p0p0p0p0p0p0p0p0", note: "Front table, left side", width: 1280, height: 960 },
    });
  });

  it("keeps the photo when only a new note arrives", () => {
    const withPhoto = backendSubtask({ status: "claimed", photo: backendMedia(), helper_note: "Front table" });

    const state = play([
      snapshot([backendTask({ subtasks: [withPhoto] })]),
      ev(SEQ + 1, "photo.added", { task_id: task.id, subtask_id: sub.id, media: null, helper_note: "Front table, left side" }),
    ]);

    expect(state.subtasks[sub.id]?.photo).toMatchObject({ url: "http://localhost:3001/media/med_p0p0p0p0p0p0p0p0", note: "Front table, left side" });
  });

  it("patches the Yik Yak post", () => {
    const screenshot = backendMedia({ id: "med_s0s0s0s0s0s0s0s0", kind: "yikyak_screenshot" });

    const state = play([
      snapshot([backendTask({ subtasks: [sub] })]),
      ev(SEQ + 1, "yikyak.posted", { task_id: task.id, subtask_id: sub.id, media: screenshot, post_text: "$4 to save a seat", posted_at: "2026-10-11T18:00:50.000Z" }),
    ]);

    expect(state.subtasks[sub.id]?.yikyak_post).toEqual({
      text: "$4 to save a seat",
      screenshot_url: "http://localhost:3001/media/med_s0s0s0s0s0s0s0s0",
      posted_at: "2026-10-11T18:00:50.000Z",
    });
  });

  it("counts PIN tries down, then locks", () => {
    const claimed = backendSubtask({ status: "claimed" });
    const start = play([snapshot([backendTask({ subtasks: [claimed] })])]);

    const wrong = play([ev(SEQ + 1, "pin.failed", { task_id: task.id, subtask_id: sub.id, attempts: 1, attempts_left: 2 })], start);
    const locked = play([ev(SEQ + 2, "pin.locked", { task_id: task.id, subtask_id: sub.id, attempts: 3 })], wrong);

    expect(wrong.subtasks[sub.id]).toMatchObject({ pin_attempts_left: 2, pin_locked: false });
    expect(locked.subtasks[sub.id]).toMatchObject({ pin_attempts_left: 0, pin_locked: true, status: "claimed" });
  });

  it("keeps PIN state and parent text through subtask.claimed and subtask.paid", () => {
    const claimed = backendSubtask({ status: "claimed", helper_address: ADDRESSES.helper });
    const paid = backendSubtask({ status: "done", helper_address: ADDRESSES.helper, paid_at: AT, done_at: AT, payout_tx_hash: hash(9) });

    const state = play([
      snapshot([backendTask({ subtasks: [sub] })]),
      ev(SEQ + 1, "pin.failed", { task_id: task.id, subtask_id: sub.id, attempts: 1, attempts_left: 2 }),
      ev(SEQ + 2, "subtask.claimed", { subtask: claimed }),
    ]);
    const after = play(
      [ev(SEQ + 3, "subtask.paid", { subtask: paid, amount: "4.00", tx_hash: hash(9), explorer_url: `https://testnet.xrpl.org/transactions/${hash(9)}` })],
      state,
    );

    expect(state.subtasks[sub.id]).toMatchObject({ status: "claimed", pin_attempts_left: 2, description: "Save me a seat at the front table" });
    expect(after.subtasks[sub.id]).toMatchObject({ status: "done", finished_at: AT, place: "Main Stacks" });
  });

  it("applies task.paid and task.failed with the task's sub-tasks and transactions", () => {
    const paidTask = backendTask({
      status: "done",
      done_at: AT,
      subtasks: [backendSubtask({ status: "done" })],
      transactions: [backendTx({ hash: hash(20), kind: "agent_payout", amount: "6.00" })],
    });
    const failedTask = backendTask({
      status: "failed",
      fail_reason: "No helper claimed the sub-task in time",
      subtasks: [backendSubtask({ status: "failed" })],
      transactions: [backendTx({ hash: hash(21), kind: "refund_requester", amount: "6.00" })],
    });

    const paid = play([snapshot(), ev(SEQ + 1, "task.paid", { task: paidTask, amount: "6.00", tx_hash: hash(20), explorer_url: "x" })]);
    const failed = play([snapshot(), ev(SEQ + 1, "task.failed", { task: failedTask, reason: "No helper claimed the sub-task in time" })]);

    expect(paid.tasks[task.id]?.status).toBe("done");
    expect(paid.subtasks[sub.id]?.status).toBe("done");
    expect(paid.txs[hash(20)]?.kind).toBe("agent_payout");
    expect(failed.tasks[task.id]).toMatchObject({ status: "failed", failure_reason: "no_claim_in_time" });
    expect(failed.subtasks[sub.id]).toMatchObject({ status: "failed", failure_reason: "no_claim_in_time" });
    expect(failed.txs[hash(21)]?.kind).toBe("requester_refund");
  });

  it("appends agent.log {entry} with a string ID", () => {
    const state = play([snapshot(), ev(SEQ + 1, "agent.log", { entry: backendLogEntry({ id: 42, message: "Claiming the task" }) })]);

    expect(state.agentLog).toEqual([expect.objectContaining({ id: "42", message: "Claiming the task", level: "decision" })]);
  });

  it("skips an unknown event type but advances seq, so the next event applies", () => {
    const state = play([
      snapshot(),
      { seq: SEQ + 1, type: "tx.unknown", at: AT, data: { hash: hash(3) } } as unknown as BackendBoardServerMessage,
      ev(SEQ + 2, "agent.log", { entry: backendLogEntry({ id: 2 }) }),
    ]);

    expect(state.seq).toBe(SEQ + 2);
    expect(state.needsResync).toBe(false);
    expect(state.agentLog).toHaveLength(1);
  });

  it("skips a patch for a sub-task it does not have, but advances seq", () => {
    const state = play([snapshot(), ev(SEQ + 1, "pin.failed", { task_id: task.id, subtask_id: "sub_missing000000000", attempts: 1, attempts_left: 2 })]);

    expect(state.seq).toBe(SEQ + 1);
    expect(state.subtasks).toEqual({});
  });

  it("drops a message that is not an event (no type or seq)", () => {
    expect(boardMessageFromBackend({ hello: "there" }, initialBoardState)).toBeNull();
    expect(boardMessageFromBackend(null, initialBoardState)).toBeNull();
  });
});
