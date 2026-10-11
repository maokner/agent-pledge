"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getBoardTransport } from "./get-transport";
import { createBoardSync, type BoardSync, type BoardSyncSnapshot } from "./sync";
import { initialBoardState } from "./state";
import type { BoardTransport } from "./transport";

const SERVER_SNAPSHOT: BoardSyncSnapshot = { state: initialBoardState, status: "idle" };

/**
 * Live board state. Connects on mount (fixture stream or real WebSocket,
 * per NEXT_PUBLIC_FIXTURES), reconnects and resyncs by seq, disconnects on
 * unmount.
 *
 *   const { state, status } = useBoard();
 *   const tasks = selectTaskViews(state);
 */
export function useBoard(transport?: BoardTransport): BoardSyncSnapshot {
  const [sync] = useState<BoardSync>(() => createBoardSync(transport ?? lazyTransport()));

  useEffect(() => {
    sync.start();
    return () => sync.stop();
  }, [sync]);

  return useSyncExternalStore(sync.subscribe, sync.getSnapshot, () => SERVER_SNAPSHOT);
}

/** Defers picking the transport until the first open, which only happens in the browser. */
function lazyTransport(): BoardTransport {
  let real: BoardTransport | null = null;
  return { open: (since, handlers) => (real ??= getBoardTransport()).open(since, handlers) };
}
