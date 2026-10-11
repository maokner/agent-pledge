/**
 * The human list (/human) of open sub-tasks, from GET /subtasks/open (DRAFT, #17).
 */
import type { OpenSubtaskSummary } from "@/lib/contract";

/**
 * What the list shows at `now` (ms; correct it with the response's
 * server_time if the phone clock may be off): sub-tasks whose deadline is
 * still ahead, soonest deadline first. Ties go to the newer sub-task, then
 * by claim code, so the order is stable between refreshes. Returns a new array.
 */
export function openSubtasksToShow(
  subtasks: readonly OpenSubtaskSummary[],
  now: number,
): OpenSubtaskSummary[] {
  return subtasks
    .map((subtask) => ({
      subtask,
      deadline: Date.parse(subtask.deadline_at),
      created: Date.parse(subtask.created_at),
    }))
    .filter(({ deadline }) => deadline > now)
    .sort(
      (a, b) =>
        a.deadline - b.deadline ||
        (b.created || 0) - (a.created || 0) ||
        a.subtask.claim_code.localeCompare(b.subtask.claim_code),
    )
    .map(({ subtask }) => subtask);
}
