"use client";

import type { WorkStatus } from "@agent-pledge/shared";
import { WorkStatusBadge } from "@/components/ui/StatusBadge";
import { useChangeCount } from "@/lib/use-change-count";
import { WORK_STATUS_STYLE } from "./status-style";

/** A status badge that pops each time the status changes (demo steps 7, 10 and 13). */
export function LiveStatusBadge({ status, size }: { status: WorkStatus; size?: "sm" | "lg" }) {
  const changes = useChangeCount(status);
  return (
    <WorkStatusBadge
      key={changes}
      status={status}
      size={size}
      className={changes > 0 ? "motion-safe:animate-status-pop" : undefined}
    />
  );
}

/**
 * A ring in the new status color that glows and fades over its card when the
 * status changes. Place it inside a `relative` card.
 */
export function StatusGlow({ status }: { status: WorkStatus }) {
  const changes = useChangeCount(status);
  if (changes === 0) return null;
  return (
    <span
      key={changes}
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 ring-4 motion-safe:animate-card-glow ${WORK_STATUS_STYLE[status].glow}`}
    />
  );
}
