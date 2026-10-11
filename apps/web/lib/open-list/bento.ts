/**
 * The /human bento grid: which open sub-task gets the big featured card and
 * how many columns and rows each card spans (docs/design/DIRECTION.md, "Human side").
 *
 * - The highest-paying sub-task is featured (ties: the sooner deadline).
 * - The rest follow soonest deadline first, as openSubtasksToShow() orders them.
 * - Spans keep every row full on md (2 columns) and lg (3 columns). On lg the
 *   featured card is 2 columns x 2 rows with two small cards stacked beside it,
 *   then rows of three, like the reference screenshot.
 */
import type { OpenSubtaskSummary } from "@/lib/contract";
import { openSubtasksToShow } from "../api/open-subtasks";

export interface BentoCell {
  subtask: OpenSubtaskSummary;
  featured: boolean;
  /** Columns spanned on md screens (2-column grid). */
  md: 1 | 2;
  /** Columns spanned on lg screens (3-column grid). */
  lg: 1 | 2 | 3;
  /** Rows spanned on lg screens. */
  lgRows: 1 | 2;
}

/** The cells to show at `now` (server clock, ms), the featured one first. Expired sub-tasks are left out. */
export function bentoCells(subtasks: readonly OpenSubtaskSummary[], now: number): BentoCell[] {
  const ordered = openSubtasksToShow(subtasks, now);
  // Soonest deadline first already, so the first highest pay found has the sooner deadline.
  const top = ordered.reduce<OpenSubtaskSummary | null>((best, s) => (best === null || pay(s) > pay(best) ? s : best), null);
  if (top === null) return [];
  const rest = ordered.filter((s) => s !== top);

  const featured: BentoCell = {
    subtask: top,
    featured: true,
    md: 2,
    lg: rest.length === 0 ? 3 : 2,
    lgRows: rest.length >= 2 ? 2 : 1,
  };
  return [featured, ...rest.map((subtask, i) => restCell(subtask, i, rest.length))];
}

/** A small card. The first two sit beside the featured card on lg; the rest fill rows of three below it. */
function restCell(subtask: OpenSubtaskSummary, index: number, count: number): BentoCell {
  const last = index === count - 1;
  const md = last && count % 2 === 1 ? 2 : 1;
  const besideFeatured = Math.min(count, 2);
  const below = count - besideFeatured;
  let lg: BentoCell["lg"] = 1;
  if (last && index >= besideFeatured) {
    const remainder = below % 3;
    lg = remainder === 1 ? 3 : remainder === 2 ? 2 : 1;
  }
  return { subtask, featured: false, md, lg, lgRows: 1 };
}

/** The pay as a number, for comparing. A malformed amount never wins. */
function pay(subtask: OpenSubtaskSummary): number {
  const n = Number(subtask.price);
  return Number.isFinite(n) && subtask.price.trim() !== "" ? n : -Infinity;
}
