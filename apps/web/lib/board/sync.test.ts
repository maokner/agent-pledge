import type { BoardEvent, BoardServerMessage } from "@agent-pledge/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLogLine, makeTask } from "../fixtures/factories";
import { createBoardSync, reconnectDelayMs } from "./sync";
import type { BoardConnectionHandlers, BoardTransport } from "./transport";

/** A transport the test drives by hand. */
function fakeTransport() {
  const connections: { since: number; handlers: BoardConnectionHandlers; closed: boolean }[] = [];
  const transport: BoardTransport = {
    open(since, handlers) {
      const conn = { since, handlers, closed: false };
      connections.push(conn);
      return { close: () => void (conn.closed = true) };
    },
  };
  const latest = () => connections[connections.length - 1]!;
  return {
    transport,
    connections,
    latest,
    open: () => latest().handlers.onOpen(),
    send: (m: BoardServerMessage) => latest().handlers.onMessage(m),
    drop: () => latest().handlers.onClose(),
  };
}

function logEvent(seq: number): BoardEvent {
  return { type: "agent.log", seq, at: "2026-10-11T19:00:00.000Z", data: { line: makeLogLine({ id: `l${seq}` }) } };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createBoardSync", () => {
  it("connects from seq 0 and applies what it receives", () => {
    const fake = fakeTransport();
    const sync = createBoardSync(fake.transport);

    sync.start();
    fake.open();
    fake.send({ type: "task.created", seq: 1, at: "2026-10-11T19:00:00.000Z", data: { task: makeTask({ id: "tsk_a" }) } });

    expect(fake.connections[0]?.since).toBe(0);
    expect(sync.getSnapshot().status).toBe("open");
    expect(sync.getSnapshot().state.tasks.tsk_a).toBeDefined();
  });

  it("after the connection drops, reconnects from the last applied seq after a backoff", () => {
    const fake = fakeTransport();
    const sync = createBoardSync(fake.transport);
    sync.start();
    fake.open();
    fake.send(logEvent(1));
    fake.send(logEvent(2));

    fake.drop();

    expect(sync.getSnapshot().status).toBe("reconnecting");
    expect(fake.connections).toHaveLength(1);
    vi.advanceTimersByTime(reconnectDelayMs(0));
    expect(fake.connections).toHaveLength(2);
    expect(fake.latest().since).toBe(2);
  });

  it("waits longer after each failed attempt, and starts over after a good connection", () => {
    const fake = fakeTransport();
    const sync = createBoardSync(fake.transport);
    sync.start();

    fake.drop(); // first attempt never opened
    vi.advanceTimersByTime(250);
    expect(fake.connections).toHaveLength(2);

    fake.drop(); // second attempt never opened
    vi.advanceTimersByTime(250);
    expect(fake.connections).toHaveLength(2);
    vi.advanceTimersByTime(250);
    expect(fake.connections).toHaveLength(3);

    fake.open();
    fake.drop();
    vi.advanceTimersByTime(250);
    expect(fake.connections).toHaveLength(4);
  });
});

describe("createBoardSync resync", () => {
  it("on a seq gap, closes the connection and reconnects at once from the last applied seq", () => {
    const fake = fakeTransport();
    const sync = createBoardSync(fake.transport);
    sync.start();
    fake.open();
    fake.send(logEvent(1));
    fake.send(logEvent(2));

    fake.send(logEvent(5));

    expect(fake.connections[0]?.closed).toBe(true);
    expect(fake.connections).toHaveLength(2);
    expect(fake.latest().since).toBe(2);

    fake.open();
    fake.send(logEvent(3));
    fake.send(logEvent(4));
    fake.send(logEvent(5));
    expect(sync.getSnapshot().state.seq).toBe(5);
    expect(sync.getSnapshot().state.needsResync).toBe(false);
    expect(sync.getSnapshot().state.agentLog.map((l) => l.id)).toEqual(["l1", "l2", "l3", "l4", "l5"]);
  });

  it("stop closes the connection and never reconnects", () => {
    const fake = fakeTransport();
    const sync = createBoardSync(fake.transport);
    sync.start();
    fake.open();

    sync.stop();
    vi.advanceTimersByTime(60_000);

    expect(fake.connections[0]?.closed).toBe(true);
    expect(fake.connections).toHaveLength(1);
    expect(sync.getSnapshot().status).toBe("stopped");
  });

  it("tells subscribers about every change", () => {
    const fake = fakeTransport();
    const sync = createBoardSync(fake.transport);
    const listener = vi.fn();
    sync.subscribe(listener);

    sync.start();
    fake.open();
    fake.send(logEvent(1));

    expect(listener).toHaveBeenCalledTimes(3); // connecting, open, event
  });
});

describe("reconnectDelayMs", () => {
  it("starts at 250 ms, doubles, and stops at 4 s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(reconnectDelayMs)).toEqual([250, 500, 1000, 2000, 4000, 4000, 4000]);
  });
});
