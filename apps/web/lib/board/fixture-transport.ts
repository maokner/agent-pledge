/**
 * A simulated board server for fixture mode. It behaves like the contract's
 * board socket: replays events after `since` (or sends a board.snapshot when
 * `since` is older than its history), then streams live events, one every
 * `intervalMs`, forever (success and failure runs alternate).
 *
 * dropConnections() and skipNextEvent() let you exercise reconnect and
 * gap resync without a server. loadSnapshot() stands in for GET /board/state,
 * and createTask() for the broadcast after a create_task call (backup form).
 */
import type {
  BoardEvent,
  BoardServerMessage,
  BoardSnapshot,
  CreateTaskRequest,
  CreateTaskResponse,
} from "@/lib/contract";
import {
  buildCreatedTaskRun,
  buildFixtureSnapshot,
  buildLiveRun,
  foldEvents,
  toSnapshot,
} from "../fixtures/board";
import { applyBoardMessage, initialBoardState } from "./state";
import type { BoardConnectionHandlers, BoardTransport } from "./transport";

export interface FixtureTransport extends BoardTransport {
  /** What `GET /board/state` would return now. */
  loadSnapshot(): Promise<BoardSnapshot>;
  /** Ends every open connection as if the server went away. */
  dropConnections(): void;
  /** The next live event is recorded but not delivered, so clients see a gap. */
  skipNextEvent(): void;
  /**
   * What the server does after a successful create_task (the backup form,
   * #38): broadcasts task.created at once, then the rest of the seat-hold
   * flow for that task, ahead of the running live stream.
   */
  createTask(task: FixtureCreatedTask): void;
}

/** The create_task request plus the task_id it returned. */
export type FixtureCreatedTask = Omit<CreateTaskRequest, "caller_phone"> &
  Pick<CreateTaskResponse, "task_id">;

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
  let formRuns = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let skipNext = false;
  const connections = new Set<{ handlers: BoardConnectionHandlers; closed: boolean }>();

  function lastSeq(): number {
    return published.at(-1)?.seq ?? snapshot?.seq ?? 0;
  }

  function publishNext() {
    if (queue.length === 0) {
      queue = buildLiveRun({
        run: run++,
        startSeq: lastSeq() + 1,
        startTime: now(),
        stepMs: intervalMs,
      });
    }
    publish(queue.shift()!);
  }

  /** Stamps seq and `at` at publish time, so queued events stay in order after an insert. */
  function publish(queued: BoardEvent) {
    const event = {
      ...queued,
      seq: lastSeq() + 1,
      at: new Date(now()).toISOString(),
    } as BoardEvent;
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
    createTask(task) {
      ensureStarted();
      const [created, ...rest] = buildCreatedTaskRun({
        task,
        claimCode: `F${String(formRuns++ % 1000).padStart(3, "0")}`,
        startSeq: lastSeq() + 1,
        startTime: now(),
        stepMs: intervalMs,
      });
      publish(created!);
      queue = [...rest, ...queue];
    },
    async loadSnapshot() {
      const snap = ensureStarted();
      const state = foldEvents(
        published,
        applyBoardMessage(initialBoardState, { type: "board.snapshot", snapshot: snap }),
      );
      return toSnapshot(state, new Date(now()).toISOString());
    },
  };
}
