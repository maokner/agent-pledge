/**
 * The accessible name of an item in the /human list: what a screen reader
 * says for the whole card, in the same order the card shows it.
 */
import type { OpenSubtaskSummary } from "@agent-pledge/shared";
import { formatRlusd } from "../format";

/**
 * "$4.80, Bring a cold beer to Memorial Glade, Memorial Glade by the big oak, 3 minutes left".
 * `msLeft` is the time left on the server's clock. The time is in whole
 * minutes, so the name changes once a minute, not every second.
 */
export function openSubtaskLabel(subtask: OpenSubtaskSummary, msLeft: number): string {
  return [formatRlusd(subtask.price), subtask.description, subtask.place, timeLeftWords(msLeft)].join(", ");
}

/** "3 minutes left", "1 hour 5 minutes left", "under a minute left". Rounds down. */
export function timeLeftWords(msLeft: number): string {
  const totalMinutes = Math.floor(Math.max(0, msLeft) / 60_000);
  if (totalMinutes === 0) return "under a minute left";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [hours > 0 && plural(hours, "hour"), minutes > 0 && plural(minutes, "minute")].filter(Boolean);
  return `${parts.join(" ")} left`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}
