"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { R3_BUDGET_MS, type LatencyStats, type LatencyTracker } from "@/lib/board/latency";

const EMPTY: LatencyStats = { last: null, count: 0, worstTotalMs: null, overBudget: 0 };

/**
 * PRD R3 check: how long the last board event took from the server to the
 * screen. After each commit that advanced `seq`, waits for the browser to
 * paint, then closes out the events up to `seq` in the tracker.
 *
 * Shows `LAT 120 ms`, or `[SLOW] 2.4 s` in amber over the budget.
 * Hover for the split (server -> browser, browser -> screen). The same
 * numbers are on the element's data-* attributes for scripted checks.
 */
export function LatencyMeter({ latency, seq }: { latency: LatencyTracker; seq: number }) {
  const [stats, setStats] = useState(EMPTY);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      timeout = setTimeout(() => {
        latency.rendered(seq, performance.timeOrigin + performance.now());
        setStats(latency.stats());
      }, 0);
    };
    // rAF runs just before the next paint; the timeout after it runs once the frame is out.
    // A hidden tab never paints (and never runs rAF), so there we measure up to the commit.
    const frame = document.hidden ? null : requestAnimationFrame(measure);
    if (frame === null) measure();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [latency, seq]);

  const { last, worstTotalMs, overBudget, count } = stats;
  if (!last) return null;

  const slow = last.totalMs > R3_BUDGET_MS;
  const title = [
    `Last event (seq ${last.seq}): ${ms(last.totalMs)} from the server to the screen`,
    `  server -> browser ${ms(last.transitMs)} (includes any clock difference)`,
    `  browser -> screen ${ms(last.renderMs)}`,
    `Worst of the last 20: ${ms(worstTotalMs ?? 0)}`,
    `Over ${R3_BUDGET_MS / 1000} s: ${overBudget} of ${count}`,
  ].join("\n");

  return (
    <span
      className={cn(
        "text-sm whitespace-nowrap tabular-nums projector:text-base",
        slow ? "font-bold text-term-amber" : "text-term-fg-dim",
      )}
      title={title}
      aria-label={`Board updates take ${ms(last.totalMs)}`}
      data-testid="latency-meter"
      data-last-total-ms={Math.round(last.totalMs)}
      data-last-render-ms={Math.round(last.renderMs)}
      data-worst-total-ms={Math.round(worstTotalMs ?? 0)}
      data-over-budget={overBudget}
      data-count={count}
    >
      <span aria-hidden>{slow ? "[SLOW] " : "LAT "}</span>
      {ms(last.totalMs)}
    </span>
  );
}

function ms(value: number): string {
  const v = Math.max(0, value);
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
}
