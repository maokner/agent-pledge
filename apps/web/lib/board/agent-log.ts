/**
 * The local agent's decision log (PRD 9.1, #37): what the AgentLog panel
 * shows, plus the small rules for its auto-scroll.
 */
import type { AgentLogLine, TaskId } from "@/lib/contract";
import type { BoardState } from "./state";

export interface AgentLogEntry extends AgentLogLine {
  /** The task the line belongs to, or null for agent-wide lines. */
  task: { tag: string; description: string | null } | null;
}

/** Log lines in the order the server sent them (oldest first), each with its task. */
export function selectAgentLog(state: BoardState): AgentLogEntry[] {
  return state.agentLog.map((line) => ({
    ...line,
    task: line.task_id
      ? { tag: taskTag(line.task_id), description: state.tasks[line.task_id]?.description ?? null }
      : null,
  }));
}

/** A short, stable label for a task: the last 4 characters of its ID without the prefix (`task_` from the server, `tsk_` in the draft). */
export function taskTag(taskId: TaskId): string {
  return taskId.replace(/^(?:tsk|task)_/, "").slice(-4).toUpperCase();
}

/** How far from the bottom still counts as "at the bottom", for rounding and touch scrolling. */
const BOTTOM_SLACK_PX = 24;

/**
 * Whether a scroll container is at (or near) its bottom. The log follows
 * new lines while this is true, and holds still once the reader scrolls up.
 */
export function isAtBottom(el: { scrollTop: number; clientHeight: number; scrollHeight: number }): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK_PX;
}

/**
 * How many lines came after `seenId`, the last line the reader saw before
 * scrolling up. If that line fell off the capped log, every line is newer.
 */
export function countNewerThan(lines: readonly { id: string }[], seenId: string | null): number {
  if (seenId === null) return 0;
  const index = lines.findIndex((line) => line.id === seenId);
  return index === -1 ? lines.length : lines.length - 1 - index;
}
