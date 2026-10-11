/**
 * When the /human list asks for open sub-tasks again: every POLL_MS while the
 * tab is visible, at once when the Helper comes back to the tab or the phone
 * comes back online, and sooner (with backoff) after a failed refresh.
 * Nothing while the tab is hidden.
 */
import type { OpenListState } from "./feed";

/** How often a visible list refreshes (the contract proposes 10 to 15 seconds). */
export const POLL_MS = 12_000;
/** The first retry after a failure; it doubles up to POLL_MS. */
export const RETRY_BASE_MS = 2_000;

/**
 * Why the page is asking:
 * - `start`: the page just mounted
 * - `settled`: a fetch just finished (well or badly)
 * - `shown`: the tab became visible again
 * - `online`: the browser says the network is back
 */
export type FetchTrigger = "start" | "settled" | "shown" | "online";

export type FetchPlan = { kind: "now" } | { kind: "after"; ms: number } | { kind: "none" };

export function planFetch(
  state: OpenListState,
  { trigger, visible, inFlight }: { trigger: FetchTrigger; visible: boolean; inFlight: boolean },
): FetchPlan {
  // A fetch on its way plans the next one when it settles.
  if (!visible || inFlight) return { kind: "none" };
  if (trigger !== "settled") return { kind: "now" };
  const failures = state.status === "loading" ? 0 : state.failures;
  if (failures === 0) return { kind: "after", ms: POLL_MS };
  return { kind: "after", ms: Math.min(POLL_MS, RETRY_BASE_MS * 2 ** (failures - 1)) };
}
