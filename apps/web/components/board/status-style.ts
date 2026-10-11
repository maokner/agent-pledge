import type { WorkStatus } from "@agent-pledge/shared";

/**
 * One color per work status on the board (#32): open grey, claimed blue,
 * done green, failed red. `card` sets the left band and the background (so
 * cards must not set their own background). Failed is a red band and a red
 * tint, so it reads from across the room. Projector mode (#43) darkens the
 * bands one or two shades, since a projector washes light colors out.
 */
export const WORK_STATUS_STYLE: Record<WorkStatus, { card: string; glow: string }> = {
  open: {
    card: "border-l-zinc-400 bg-white dark:border-l-zinc-500 dark:bg-zinc-900 projector:border-l-zinc-700",
    glow: "ring-zinc-400",
  },
  claimed: {
    card: "border-l-sky-500 bg-white dark:bg-zinc-900 projector:border-l-sky-700",
    glow: "ring-sky-500",
  },
  done: {
    card: "border-l-emerald-500 bg-white dark:bg-zinc-900 projector:border-l-emerald-700",
    glow: "ring-emerald-500",
  },
  failed: {
    card: "border-l-rose-600 bg-rose-50 dark:bg-rose-950/60 projector:border-l-rose-700 projector:bg-rose-100",
    glow: "ring-rose-600",
  },
};
