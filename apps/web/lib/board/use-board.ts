"use client";

import type { BoardServerMessage, BoardSnapshot } from "@/lib/contract";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getBoardTransport, loadBoardSnapshot } from "./get-transport";
import { createLatencyTracker, type LatencyTracker } from "./latency";
import { createBoardSync, type BoardSync, type BoardSyncSnapshot } from "./sync";
import { initialBoardState } from "./state";
import type { BoardTransport } from "./transport";

const SERVER_SNAPSHOT: BoardSyncSnapshot = { state: initialBoardState, status: "idle" };

export interface UseBoardResult extends BoardSyncSnapshot {
  /** Server-to-screen time for each event (PRD R3). Pass to <LatencyMeter>. */
  latency: LatencyTracker;
}

export interface UseBoardOptions {
  transport?: BoardTransport;
  /** Defaults to GET /board/state (or the fixture snapshot). */
  loadSnapshot?: () => Promise<BoardSnapshot>;
}

/**
 * Live board state. On mount it loads GET /board/state, then connects the
 * board socket from that seq (fixture stream or real WebSocket, per
 * NEXT_PUBLIC_FIXTURES). It reconnects with backoff and resyncs by seq,
 * reconnects at once when the tab becomes visible or the browser comes back
 * online, and disconnects on unmount.
 *
 *   const { state, status, latency } = useBoard();
 *   const tasks = selectTaskViews(state);
 */
export function useBoard(options: UseBoardOptions = {}): UseBoardResult {
  const [{ sync, latency }] = useState(() => {
    const tracker = createLatencyTracker();
    const board: BoardSync = createBoardSync(options.transport ?? lazyTransport(), {
      loadSnapshot: options.loadSnapshot ?? loadBoardSnapshot,
      onEventApplied: (event, receivedAt) => tracker.received(event, receivedAt),
    });
    return { sync: board, latency: tracker };
  });

  useEffect(() => {
    sync.start();
    const wake = () => {
      if (document.visibilityState === "visible") sync.reconnectNow();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      sync.stop();
    };
  }, [sync]);

  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, () => SERVER_SNAPSHOT);
  return { ...snapshot, latency };
}

/** Defers picking the transport until the first open, which only happens in the browser. */
function lazyTransport(): BoardTransport {
  let real: BoardTransport | null = null;
  const get = () => (real ??= getBoardTransport());
  return {
    open: (since, handlers) => get().open(since, handlers),
    decode: (wire, state) => {
      const transport = get();
      return transport.decode ? transport.decode(wire, state) : (wire as BoardServerMessage);
    },
  };
}
