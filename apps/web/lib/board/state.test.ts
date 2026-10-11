import type { BoardEvent, BoardSnapshot } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import { makeLogLine, makeSubtask, makeTask, makeTx } from "../fixtures/factories";
import { AGENT_LOG_LIMIT, applyBoardMessage, initialBoardState } from "./state";

function snapshot(overrides: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    seq: 0,
    generated_at: "2026-10-11T19:00:00.000Z",
    tasks: [],
    subtasks: [],
    txs: [],
    agent_log: [],
    ...overrides,
  };
}

describe("applyBoardMessage", () => {
  it("replaces the whole state with a snapshot", () => {
    const task = makeTask({ id: "tsk_a" });
    const subtask = makeSubtask({ id: "sub_a", task_id: "tsk_a" });
    const tx = makeTx({ hash: "H1" });
    const line = makeLogLine({ id: "l1" });

    const state = applyBoardMessage(initialBoardState, {
      type: "board.snapshot",
      snapshot: snapshot({
        seq: 12,
        tasks: [task],
        subtasks: [subtask],
        txs: [tx],
        agent_log: [line],
      }),
    });

    expect(state.seq).toBe(12);
    expect(state.tasks).toEqual({ tsk_a: task });
    expect(state.subtasks).toEqual({ sub_a: subtask });
    expect(state.txs).toEqual({ H1: tx });
    expect(state.agentLog).toEqual([line]);
    expect(state.needsResync).toBe(false);
  });

  it("applies the next event in sequence and advances seq", () => {
    const start = applyBoardMessage(initialBoardState, {
      type: "board.snapshot",
      snapshot: snapshot({ seq: 4 }),
    });
    const task = makeTask({ id: "tsk_new" });

    const state = applyBoardMessage(start, event(5, { type: "task.created", data: { task } }));

    expect(state.seq).toBe(5);
    expect(state.tasks.tsk_new).toEqual(task);
  });
});

describe("applyBoardMessage sequencing", () => {
  const atSeq5 = applyBoardMessage(initialBoardState, {
    type: "board.snapshot",
    snapshot: snapshot({ seq: 5, tasks: [makeTask({ id: "tsk_a", status: "open" })] }),
  });

  it("ignores an event it has already applied (replayed after a reconnect)", () => {
    const stale = event(5, {
      type: "task.claimed",
      data: { task: makeTask({ id: "tsk_a", status: "claimed" }) },
    });

    const state = applyBoardMessage(atSeq5, stale);

    expect(state).toBe(atSeq5);
  });

  it("does not apply an event after a gap, and flags that it needs a resync", () => {
    const afterGap = event(7, {
      type: "task.claimed",
      data: { task: makeTask({ id: "tsk_a", status: "claimed" }) },
    });

    const state = applyBoardMessage(atSeq5, afterGap);

    expect(state.needsResync).toBe(true);
    expect(state.seq).toBe(5);
    expect(state.tasks.tsk_a?.status).toBe("open");
  });

  it("clears the resync flag once the missing event arrives", () => {
    const gapped = applyBoardMessage(
      atSeq5,
      event(7, {
        type: "task.claimed",
        data: { task: makeTask({ id: "tsk_a", status: "claimed" }) },
      }),
    );

    const state = applyBoardMessage(
      gapped,
      event(6, { type: "agent.log", data: { line: makeLogLine({ id: "l6" }) } }),
    );

    expect(state.needsResync).toBe(false);
    expect(state.seq).toBe(6);
  });
});

describe("applyBoardMessage events", () => {
  const task = makeTask({ id: "tsk_a" });
  const start = applyBoardMessage(initialBoardState, {
    type: "board.snapshot",
    snapshot: snapshot({ seq: 1, tasks: [task] }),
  });

  it("shows a transaction as pending, then validated, as one entry", () => {
    const pending = makeTx({
      hash: "MINT",
      kind: "task_nft_mint",
      tx_type: "NFTokenMint",
      status: "pending",
    });
    const validated = {
      ...pending,
      status: "validated" as const,
      engine_result: "tesSUCCESS",
      ledger_index: 100,
    };
    const minted = { ...task, nft_id: "NFT_A" };

    const afterPending = applyBoardMessage(
      start,
      event(2, { type: "tx.pending", data: { tx: pending } }),
    );
    const afterValidated = applyBoardMessage(
      afterPending,
      event(3, { type: "tx.validated", data: { tx: validated, task: minted, subtask: null } }),
    );

    expect(afterPending.txs).toEqual({ MINT: pending });
    expect(afterValidated.txs).toEqual({ MINT: validated });
    expect(afterValidated.tasks.tsk_a?.nft_id).toBe("NFT_A");
  });

  it("follows a sub-task from creation to payout", () => {
    const claimedTask = { ...task, status: "claimed" as const, subtask_ids: ["sub_a"] };
    const sub = makeSubtask({ id: "sub_a", task_id: "tsk_a" });
    const posted = {
      ...sub,
      yikyak_post: {
        text: "$4 to save a seat",
        screenshot_url: "/s.png",
        posted_at: sub.created_at,
      },
    };
    const claimed = { ...posted, status: "claimed" as const, helper_address: "rHelper" };
    const withPhoto = {
      ...claimed,
      photo: { url: "/p.jpg", note: "Front table, left side", added_at: sub.created_at },
    };
    const wrongPin = { ...withPhoto, pin_attempts_left: 2 };
    const done = { ...wrongPin, status: "done" as const };
    const doneTask = { ...claimedTask, status: "done" as const };

    const messages: BoardEvent[] = [
      event(2, { type: "task.claimed", data: { task: { ...task, status: "claimed" } } }),
      event(3, { type: "subtask.created", data: { subtask: sub, task: claimedTask } }),
      event(4, { type: "yikyak.posted", data: { subtask: posted } }),
      event(5, { type: "subtask.claimed", data: { subtask: claimed } }),
      event(6, { type: "photo.added", data: { subtask: withPhoto } }),
      event(7, { type: "pin.failed", data: { subtask: wrongPin } }),
      event(8, { type: "task.paid", data: { task: doneTask, subtasks: [done] } }),
    ];
    const states = messages.reduce(
      (acc, m) => [...acc, applyBoardMessage(acc[acc.length - 1]!, m)],
      [start],
    );

    expect(states[2]?.tasks.tsk_a?.subtask_ids).toEqual(["sub_a"]);
    expect(states[3]?.subtasks.sub_a?.yikyak_post?.text).toBe("$4 to save a seat");
    expect(states[4]?.subtasks.sub_a?.status).toBe("claimed");
    expect(states[5]?.subtasks.sub_a?.photo?.note).toBe("Front table, left side");
    expect(states[6]?.subtasks.sub_a?.pin_attempts_left).toBe(2);
    expect(states[7]?.tasks.tsk_a?.status).toBe("done");
    expect(states[7]?.subtasks.sub_a?.status).toBe("done");
  });

  it("marks the task and its sub-tasks failed", () => {
    const sub = makeSubtask({
      id: "sub_a",
      task_id: "tsk_a",
      pin_locked: true,
      pin_attempts_left: 0,
    });
    const locked = applyBoardMessage(
      start,
      event(2, { type: "pin.locked", data: { subtask: sub } }),
    );

    const failed = applyBoardMessage(
      locked,
      event(3, {
        type: "task.failed",
        data: {
          task: { ...task, status: "failed", failure_reason: "pin_locked" },
          subtasks: [{ ...sub, status: "failed", failure_reason: "pin_locked" }],
        },
      }),
    );

    expect(locked.subtasks.sub_a?.pin_locked).toBe(true);
    expect(failed.tasks.tsk_a?.status).toBe("failed");
    expect(failed.subtasks.sub_a?.status).toBe("failed");
  });
});

describe("applyBoardMessage with the real server's extra events", () => {
  const atSeq5 = applyBoardMessage(initialBoardState, {
    type: "board.snapshot",
    snapshot: snapshot({ seq: 5, tasks: [makeTask({ id: "tsk_a" })] }),
  });

  it("ignores an unknown event type but still advances seq, so the next event is not a gap", () => {
    const unknown = {
      type: "tx.unknown",
      seq: 6,
      at: "2026-10-11T19:00:00.000Z",
      data: { hash: "H" },
    } as unknown as BoardEvent;

    const state = applyBoardMessage(atSeq5, unknown);
    const next = applyBoardMessage(
      state,
      event(7, { type: "agent.log", data: { line: makeLogLine({ id: "l7" }) } }),
    );

    expect(state.seq).toBe(6);
    expect(state.tasks).toEqual(atSeq5.tasks);
    expect(next.needsResync).toBe(false);
    expect(next.agentLog.map((l) => l.id)).toEqual(["l7"]);
  });

  it("applies tx.failed as an upsert of the failed transaction", () => {
    const pending = makeTx({ hash: "PAY", status: "pending" });
    const withPending = applyBoardMessage(
      atSeq5,
      event(6, { type: "tx.pending", data: { tx: pending } }),
    );

    const state = applyBoardMessage(
      withPending,
      event(7, {
        type: "tx.failed",
        data: { tx: { ...pending, status: "failed", error: "tecUNFUNDED_PAYMENT" } },
      }),
    );

    expect(state.txs.PAY?.status).toBe("failed");
    expect(state.txs.PAY?.error).toBe("tecUNFUNDED_PAYMENT");
  });

  it("applies subtask.paid as an upsert of the sub-task", () => {
    const sub = makeSubtask({ id: "sub_a", task_id: "tsk_a", status: "done" });

    const state = applyBoardMessage(
      atSeq5,
      event(6, { type: "subtask.paid", data: { subtask: sub } }),
    );

    expect(state.subtasks.sub_a?.status).toBe("done");
  });

  it("upserts the sub-tasks and transactions that come with a task event", () => {
    const sub = makeSubtask({ id: "sub_a", task_id: "tsk_a" });
    const tx = makeTx({ hash: "MINT", task_id: "tsk_a" });

    const state = applyBoardMessage(
      atSeq5,
      event(6, {
        type: "task.created",
        data: {
          task: makeTask({ id: "tsk_a", subtask_ids: ["sub_a"] }),
          subtasks: [sub],
          txs: [tx],
        },
      }),
    );

    expect(state.subtasks.sub_a).toEqual(sub);
    expect(state.txs.MINT).toEqual(tx);
  });
});

describe("agent log", () => {
  it("appends lines and keeps only the most recent AGENT_LOG_LIMIT", () => {
    let state = initialBoardState;
    for (let seq = 1; seq <= AGENT_LOG_LIMIT + 2; seq++) {
      state = applyBoardMessage(
        state,
        event(seq, { type: "agent.log", data: { line: makeLogLine({ id: `l${seq}` }) } }),
      );
    }

    expect(state.agentLog).toHaveLength(AGENT_LOG_LIMIT);
    expect(state.agentLog[0]?.id).toBe("l3");
    expect(state.agentLog.at(-1)?.id).toBe(`l${AGENT_LOG_LIMIT + 2}`);
  });
});

function event<E extends BoardEvent>(seq: number, partial: Pick<E, "type" | "data">): BoardEvent {
  return { ...partial, seq, at: "2026-10-11T19:00:00.000Z" } as BoardEvent;
}
