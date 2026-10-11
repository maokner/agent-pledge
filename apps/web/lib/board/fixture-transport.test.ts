import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureTransport } from "./fixture-transport";
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
});
