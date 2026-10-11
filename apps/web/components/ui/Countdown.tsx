"use client";

import type { IsoDateTime } from "@agent-pledge/shared";
import { formatTimeLeft } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/** Live "m:ss" until a deadline. */
export function Countdown({ deadline, className }: { deadline: IsoDateTime; className?: string }) {
  const now = useNow();
  return <span className={`tabular-nums ${className ?? ""}`}>{now === null ? "–:––" : formatTimeLeft(deadline, now)}</span>;
}
