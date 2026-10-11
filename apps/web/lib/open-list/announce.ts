/**
 * What the /human list's polite live region says when a refresh brings new
 * sub-tasks. Countdown ticks and items going away are never announced.
 */
import type { OpenSubtaskSummary } from "@/lib/contract";
import { formatRlusd } from "../format";

/**
 * The message for sub-tasks in `next` whose claim code was not in
 * `previousCodes`, or null when there is nothing to say. `previousCodes` is
 * null before the first load: the first list is the page, not news.
 */
export function arrivalAnnouncement(
  previousCodes: readonly string[] | null,
  next: readonly OpenSubtaskSummary[],
): string | null {
  if (previousCodes === null) return null;
  const known = new Set(previousCodes);
  const arrived = next.filter((subtask) => !known.has(subtask.claim_code));
  const [first] = arrived;
  if (!first) return null;
  if (arrived.length === 1)
    return `New sub-task: ${formatRlusd(first.price)}, ${first.description}`;
  return `${arrived.length} new sub-tasks`;
}
