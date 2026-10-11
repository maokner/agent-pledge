"use client";

import { useState } from "react";
import { NO_ARRIVALS, trackArrivals } from "./arrivals";

/**
 * The task IDs that arrived after the board's first load (see arrivals.ts).
 * Their cards flash once with `animate-term-arrive`.
 *
 *   const arrived = useArrivals(tasks.map((v) => v.task.id), state.seq > 0 || status === "open");
 */
export function useArrivals(ids: readonly string[], ready: boolean): ReadonlySet<string> {
  const [arrivals, setArrivals] = useState(NO_ARRIVALS);
  const next = trackArrivals(arrivals, ids, ready);
  if (next !== arrivals) {
    // Adjusting state while rendering, as in useChangeCount.
    setArrivals(next);
  }
  return next.arrived;
}
