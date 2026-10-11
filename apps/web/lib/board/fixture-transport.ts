/**
 * A simulated board server for fixture mode. It behaves like the contract's
 * board socket: replays events after `since` (or sends a board.snapshot when
 * `since` is older than its history), then streams live events, one every
 * `intervalMs`, forever (success and failure runs alternate).
 *
 * dropConnections() and skipNextEvent() let you exercise reconnect and
 * gap resync without a server.
 */
import type { BoardEvent, BoardServerMessage, BoardSnapshot } from "@agent-pledge/shared";
import { buildFixtureSnapshot, buildLiveRun } from "../fixtures/board";
import type { BoardConnectionHandlers, BoardTransport } from "./transport";

export interface FixtureTransport extends BoardTransport {
  /** Ends every open connection as if the server went away. */
  dropConnections(): void;
  /** The next live event is recorded but not delivered, so clients see a gap. */
  skipNextEvent(): void;
}

export interface FixtureTransportOptions {
  intervalMs?: number;
  now?: () => number;
}

export function createFixtureTransport(options: FixtureTransportOptions = {}): FixtureTransport {
  const intervalMs = options.intervalMs ?? 1500;
  const now = options.now ?? Date.now;

  let snapshot: BoardSnapshot | null = null;
  const published: BoardEvent[] = [];
  let queue: BoardEvent[] = [];
  let run = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let skipNext = false;
  const connections = new Set<{ handlers: BoardConnectionHandlers; closed: boolean }>();

  function lastSeq(): number {
    return published.at(-1)?.seq ?? snapshot?.seq ?? 0;
  }

  function publishNext() {
    if (queue.length === 0) {
      queue = buildLiveRun({ run: run++, startSeq: lastSeq() + 1, startTime: now(), stepMs: intervalMs });
    }
    const event = queue.shift()!;
    published.push(event);
    if (skipNext) {
      skipNext = false;
      return;
    }
    for (const conn of [...connections]) if (!conn.closed) conn.handlers.onMessage(event);
  }

  function ensureStarted(): BoardSnapshot {
    if (!snapshot) snapshot = buildFixtureSnapshot(now());
    if (!timer) timer = setInterval(publishNext, intervalMs);
    return snapshot;
  }

  return {
    open(since, handlers) {
      const conn = { handlers, closed: false };
      setTimeout(() => {
        if (conn.closed) return;
        const snap = ensureStarted();
        connections.add(conn);
        handlers.onOpen();
        const backlog: BoardServerMessage[] =
          since < snap.seq
            ? [{ type: "board.snapshot", snapshot: snap }, ...published]
            : published.filter((e) => e.seq > since);
        for (const message of backlog) {
          if (conn.closed) return;
          handlers.onMessage(message);
        }
      }, 0);
      return {
        close() {
          conn.closed = true;
          connections.delete(conn);
        },
      };
    },
    dropConnections() {
      for (const conn of [...connections]) {
        conn.closed = true;
        connections.delete(conn);
        conn.handlers.onClose();
      }
    },
    skipNextEvent() {
      skipNext = true;
    },
  };
}
