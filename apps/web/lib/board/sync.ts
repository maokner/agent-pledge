/**
 * Keeps a BoardState in sync with the server over a BoardTransport:
 * connects with since = last applied seq, reconnects with backoff when the
 * connection drops, and reconnects at once when it sees a seq gap.
 *
 * Framework-free; useBoard wraps it with useSyncExternalStore.
 */
import type { BoardServerMessage } from "@agent-pledge/shared";
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

export function createBoardSync(transport: BoardTransport): BoardSync {
  let snapshot: BoardSyncSnapshot = { state: initialBoardState, status: "idle" };
  let connection: BoardConnection | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
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
      onMessage: (message: BoardServerMessage) => {
        const state = applyBoardMessage(snapshot.state, message);
        if (state === snapshot.state) return;
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
      connect();
    },
    stop() {
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
