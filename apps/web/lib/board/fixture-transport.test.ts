import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureTransport } from "./fixture-transport";
import { R3_BUDGET_MS } from "./latency";
import { createBoardSync } from "./sync";

const NOW = Date.parse("2026-10-11T19:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("fixture transport with board sync", () => {
  it("starts a new board from the fixture snapshot, then streams live events", () => {
    const transport = createFixtureTransport({ intervalMs: 1000 });
    const board = createBoardSync(transport);

    board.start();
    vi.advanceTimersByTime(0);
    const atOpen = board.getSnapshot().state;
    vi.advanceTimersByTime(3000);

    expect(Object.keys(atOpen.tasks)).toHaveLength(5);
    expect(board.getSnapshot().state.seq).toBe(atOpen.seq + 3);
    expect(board.getSnapshot().state.tasks.tsk_live0).toBeDefined();
  });

  it("a board that lost its connection catches up to one that did not", () => {
    const transport = createFixtureTransport({ intervalMs: 1000 });
    const steady = createBoardSync(transport);
    const flaky = createBoardSync(transport);
    steady.start();
    flaky.start();
    vi.advanceTimersByTime(2000);

    flaky.stop();
    vi.advanceTimersByTime(5000);
    flaky.start();
    vi.advanceTimersByTime(10);

    expect(flaky.getSnapshot().state).toEqual(steady.getSnapshot().state);
  });

  it("a board that missed an event resyncs and catches up", () => {
    const transport = createFixtureTransport({ intervalMs: 1000 });
    const steady = createBoardSync(transport);
    steady.start();
    vi.advanceTimersByTime(1500);

    transport.skipNextEvent();
    vi.advanceTimersByTime(1000); // skipped event
    vi.advanceTimersByTime(1000); // next event reveals the gap
    vi.advanceTimersByTime(10); // reconnect and replay

    const fresh = createBoardSync(transport);
    fresh.start();
    vi.advanceTimersByTime(10);

    expect(steady.getSnapshot().state.needsResync).toBe(false);
    expect(steady.getSnapshot().state).toEqual(fresh.getSnapshot().state);
  });

  it("reconnects after the server drops the connection", () => {
    const transport = createFixtureTransport({ intervalMs: 1000 });
    const board = createBoardSync(transport);
    board.start();
    vi.advanceTimersByTime(1500);
    const before = board.getSnapshot().state.seq;

    transport.dropConnections();
    expect(board.getSnapshot().status).toBe("reconnecting");
    vi.advanceTimersByTime(3000);

    expect(board.getSnapshot().status).toBe("open");
    expect(board.getSnapshot().state.seq).toBe(before + 3);
  });

  it("a board that loads GET /board/state first matches one that took the socket's snapshot", async () => {
    const transport = createFixtureTransport({ intervalMs: 1000 });
    const steady = createBoardSync(transport);
    steady.start();
    await vi.advanceTimersByTimeAsync(2500);

    const loaded = createBoardSync(transport, { loadSnapshot: () => transport.loadSnapshot() });
    loaded.start();
    await vi.advanceTimersByTimeAsync(10);

    expect(loaded.getSnapshot().state).toEqual(steady.getSnapshot().state);
  });

  it("shows a task from the backup form at once, then runs it through the seat-hold flow", () => {
    const transport = createFixtureTransport({ intervalMs: 1000 });
    const board = createBoardSync(transport);
    board.start();
    vi.advanceTimersByTime(1500); // mid-way through a live run

    transport.createTask({
      task_id: "tsk_form_1",
      description: "Save me a seat by the stairs",
      place: "Doe Library, 2nd floor",
      time_limit_minutes: 7,
      price_usd: 6,
    });
    vi.advanceTimersByTime(1);

    const task = board.getSnapshot().state.tasks.tsk_form_1;
    expect(task).toMatchObject({
      description: "Save me a seat by the stairs",
      place: "Doe Library, 2nd floor",
      price: "6",
      time_limit_minutes: 7,
    });
    expect(board.getSnapshot().state.needsResync).toBe(false);

    vi.advanceTimersByTime(30_000);
    const state = board.getSnapshot().state;
    expect(state.tasks.tsk_form_1?.subtask_ids).toHaveLength(1);
    expect(Object.values(state.subtasks).find((s) => s.task_id === "tsk_form_1")?.price).toBe(
      "4.5",
    );
    const fresh = createBoardSync(transport);
    fresh.start();
    vi.advanceTimersByTime(1);
    expect(fresh.getSnapshot().state).toEqual(state);
  });

  it("catches up within the 2 second budget after the connection drops (PRD R3)", () => {
    const transport = createFixtureTransport({ intervalMs: 1000 });
    const board = createBoardSync(transport);
    board.start();
    vi.advanceTimersByTime(1990); // an event is about to be published
    const before = board.getSnapshot().state.seq;

    transport.dropConnections();
    vi.advanceTimersByTime(10); // published while the board is down
    expect(board.getSnapshot().state.seq).toBe(before);

    vi.advanceTimersByTime(R3_BUDGET_MS - 1010); // just before the next event
    const reference = createBoardSync(transport);
    reference.start();
    vi.advanceTimersByTime(1);
    expect(board.getSnapshot().state.seq).toBe(before + 1);
    expect(board.getSnapshot().state).toEqual(reference.getSnapshot().state);
  });
});
