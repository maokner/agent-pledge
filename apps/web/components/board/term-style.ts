import type { WorkStatus } from "@agent-pledge/shared";
import type { TermTone } from "@/lib/board/terminal";

/**
 * Class names for the agent design system's board status map
 * (docs/design/agent-design-system.md). Always shown with a text tag
 * (lib/board/terminal.ts), never as color alone.
 */
export const TONE_TEXT: Record<TermTone | "planned", string> = {
  open: "text-term-status-open",
  claimed: "text-term-status-claimed",
  // [DONE] is an inverted block: black text on a green fill.
  done: "bg-term-status-done text-term-bg text-shadow-none",
  failed: "text-term-status-failed",
  pending: "text-term-status-pending",
  validated: "text-term-status-validated",
  refund: "text-term-status-refund",
  planned: "text-term-fg-dim",
};

export const TONE_BORDER: Record<TermTone | "planned", string> = {
  open: "border-term-status-open",
  claimed: "border-term-status-claimed",
  done: "border-term-status-done",
  failed: "border-term-status-failed",
  pending: "border-term-status-pending",
  validated: "border-term-status-validated",
  refund: "border-term-status-refund border-dashed",
  planned: "border-term-line border-dashed",
};

/** A task or sub-task window's border: quiet while running, green when done, red when failed. */
export const WORK_BORDER: Record<WorkStatus, string> = {
  open: "border-term-line",
  claimed: "border-term-line",
  done: "border-term-status-done",
  failed: "border-term-status-failed",
};

/** Phosphor glow for primary text: full in normal mode, subtle on the big screen so large text stays sharp. */
export const GLOW = "text-shadow-term-glow projector:text-shadow-term-glow-subtle";

/** A terminal link: dotted underline; hover and focus invert it (green fill, black text). */
export const LINK =
  "underline decoration-dotted underline-offset-4 outline-none hover:bg-term-fg hover:text-term-bg hover:decoration-solid hover:text-shadow-none focus-visible:bg-term-fg focus-visible:text-term-bg focus-visible:text-shadow-none";
