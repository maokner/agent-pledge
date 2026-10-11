"use client";

import type { IsoDateTime } from "@agent-pledge/shared";
import { cn } from "@/lib/cn";
import { formatMsLeft, msLeft } from "@/lib/claim/clock";
import { useNow } from "@/lib/use-now";

/** Under this, the time left turns red and bold. */
export const URGENT_MS = 60_000;

/**
 * Time left as "2:31" (or "1:05:09"), with tabular digits. Red and bold under
 * `urgentBelowMs` (one minute by default). `ms` null shows "–:––" (not loaded yet).
 * A `role="timer"` that does not announce every tick.
 */
export function TimeLeft({
  ms,
  urgentBelowMs = URGENT_MS,
  className,
}: {
  ms: number | null;
  urgentBelowMs?: number;
  className?: string;
}) {
  const urgent = ms !== null && ms < urgentBelowMs;
  return (
    <span
      role="timer"
      aria-live="off"
      className={cn("font-semibold tabular-nums", urgent && "font-bold text-human-danger", className)}
    >
      {ms === null ? "–:––" : formatMsLeft(ms)}
    </span>
  );
}

/**
 * A live `TimeLeft` to a deadline, ticking every second. Pass `offsetMs`
 * (server clock minus phone clock, see lib/claim/clock.ts) when you have it,
 * since a phone's clock can be off by minutes.
 */
export function Countdown({
  deadline,
  offsetMs = 0,
  urgentBelowMs,
  className,
}: {
  deadline: IsoDateTime;
  offsetMs?: number;
  urgentBelowMs?: number;
  className?: string;
}) {
  const now = useNow(1000);
  return (
    <TimeLeft
      ms={now === null ? null : msLeft(deadline, now, offsetMs)}
      urgentBelowMs={urgentBelowMs}
      className={className}
    />
  );
}
