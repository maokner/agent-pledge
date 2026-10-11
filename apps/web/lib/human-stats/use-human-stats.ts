"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getApiClient } from "../api";
import { humanStats, startOfLocalDay, type HumanStats } from "./stats";

/** How often the stats band asks the board again while the tab is visible. */
export const STATS_POLL_MS = 30_000;

/**
 * The /human stats band's numbers, from getApiClient().getBoardState().
 * Loads on mount, every STATS_POLL_MS while the tab is visible, and at once
 * when the tab is shown again. Null until the first load works (the band shows
 * "–"). A later failed refresh keeps the last numbers; it never throws.
 *
 * "Now" is the board's generated_at (the server's clock), and "today" starts
 * at local midnight on this device.
 */
export function useHumanStats(): HumanStats | null {
  const [stats, setStats] = useState<HumanStats | null>(null);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = async () => {
      try {
        const board = await getApiClient().getBoardState();
        const serverNow = Date.parse(board.generated_at);
        const now = Number.isFinite(serverNow) ? serverNow : Date.now();
        if (!cancelled) setStats(humanStats(board, { now, dayStart: startOfLocalDay(Date.now()) }));
      } catch {
        // Keep what is on screen; the next poll tries again.
      }
    };
    void load();
    const timer = setInterval(() => void load(), STATS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visible]);

  return stats;
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
