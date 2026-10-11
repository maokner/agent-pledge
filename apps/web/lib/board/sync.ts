/**
 * Keeps a BoardState in sync with the server over a BoardTransport:
 * connects with since = last applied seq, reconnects with backoff when the
 * connection drops, and reconnects at once when it sees a seq gap.
 *
 * Framework-free; useBoard wraps it with useSyncExternalStore.
 */
import type { BoardEvent, BoardServerMessage, BoardSnapshot } from "@/lib/contract";
import { applyBoardMessage, initialBoardState, type BoardState } from "./state";
import type { BoardConnection, BoardTransport } from "./transport";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "stopped";

export interface BoardSyncSnapshot {
  state: BoardState;
  status: ConnectionStatus;
}

export interface BoardSync {
  start(): void;
  stop(): void;
  /**
   * If waiting to reconnect, reconnect now and reset the backoff. Call it
   * when the page becomes visible or the browser comes back online: a phone
   * that slept may otherwise wait out a long backoff (PRD R3).
   */
  reconnectNow(): void;
  /** Stable between changes, as useSyncExternalStore needs. */
  getSnapshot(): BoardSyncSnapshot;
  subscribe(listener: () => void): () => void;
}

/**
 * Delay before reconnect attempt number `attempt` (0-based): 250 ms, doubling,
 * capped at 4 s. Short, because the board must catch up within 2 s (PRD R3).
 */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 4000);
}

export interface BoardSyncOptions {
  /**
   * `GET /board/state`. Loaded once on start, before the first connection,
   * which then asks only for events after the snapshot's seq. If it fails,
   * the socket connects from seq 0 and the server sends a board.snapshot.
   */
  loadSnapshot?: () => Promise<BoardSnapshot>;
  /**
   * Called for each event applied to the state (not duplicates, not events
   * after a gap), with the epoch ms it arrived, before subscribers hear of
   * the change. Feeds the R3 latency meter.
   */
  onEventApplied?: (event: BoardEvent, receivedAt: number) => void;
  /** Epoch ms. Defaults to a sub-millisecond clock. */
  now?: () => number;
}

export function createBoardSync(
  transport: BoardTransport,
  options: BoardSyncOptions = {},
): BoardSync {
  const now = options.now ?? (() => performance.timeOrigin + performance.now());
  let snapshot: BoardSyncSnapshot = { state: initialBoardState, status: "idle" };
  let connection: BoardConnection | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  /** Bumped by stop(), so a snapshot load that finishes after stop() does nothing. */
  let generation = 0;
  const listeners = new Set<() => void>();

  function set(next: Partial<BoardSyncSnapshot>) {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((l) => l());
  }

  function connect() {
    connection = transport.open(snapshot.state.seq, {
      onOpen: () => {
        attempt = 0;
        set({ status: "open" });
      },
      onMessage: (wire: unknown) => {
        const receivedAt = now();
        const message = transport.decode
          ? transport.decode(wire, snapshot.state)
          : (wire as BoardServerMessage);
        if (!message) return;
        const state = applyBoardMessage(snapshot.state, message);
        if (state === snapshot.state) return;
        if (message.type !== "board.snapshot" && state.seq === message.seq) {
          options.onEventApplied?.(message, receivedAt);
        }
        set({ state });
        if (state.needsResync) {
          // Missed events: start over from the last seq we applied.
          connection?.close();
          set({ status: "connecting" });
          connect();
        }
      },
      onClose: () => {
        connection = null;
        set({ status: "reconnecting" });
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, reconnectDelayMs(attempt++));
      },
    });
  }

  return {
    start() {
      set({ status: "connecting" });
      const { loadSnapshot } = options;
      if (!loadSnapshot) return connect();
      const started = generation;
      loadSnapshot()
        .then((board) => {
          if (started !== generation || snapshot.state.seq > board.seq) return;
          set({
            state: applyBoardMessage(snapshot.state, { type: "board.snapshot", snapshot: board }),
          });
        })
        .catch((error: unknown) =>
          console.warn("Could not load the board snapshot; the socket will send one", error),
        )
        .finally(() => {
          if (started === generation) connect();
        });
    },
    reconnectNow() {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      attempt = 0;
      set({ status: "connecting" });
      connect();
    },
    stop() {
      generation++;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      connection?.close();
      connection = null;
      set({ status: "stopped" });
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
