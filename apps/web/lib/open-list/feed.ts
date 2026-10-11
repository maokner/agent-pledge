/**
 * The /human list's data, as a reducer: what the last good load said, how far
 * the phone's clock is from the server's, how many refreshes in a row have
 * failed, and what to announce about new sub-tasks.
 */
import type { ListOpenSubtasksResponse, OpenSubtaskSummary } from "@/lib/contract";
import { clockOffsetMs } from "../claim/clock";
import { arrivalAnnouncement } from "./announce";

export type OpenListState =
  /** Nothing shown yet; the first load is on its way. */
  | { status: "loading" }
  /** The first load failed `failures` times in a row; nothing to show. */
  | { status: "error"; failures: number }
  | {
      status: "ready";
      /** The last good load, unsorted. Show it with openSubtasksToShow(). */
      subtasks: readonly OpenSubtaskSummary[];
      /** Server clock minus phone clock, from the last good load. */
      offsetMs: number;
      /** Refreshes failed in a row since the last good load. Above 0, the list may be out of date. */
      failures: number;
      /** Claim codes in the first list shown: only these fade in (once, as they mount). */
      entering: readonly string[];
      /** For the polite live region: the sub-tasks the last load added, or null. */
      announcement: string | null;
    };

export type OpenListEvent =
  | { type: "loaded"; response: ListOpenSubtasksResponse; receivedAt: number }
  | { type: "failed" }
  /** The Helper pressed Try again after the first load failed. */
  | { type: "retry" };

export const INITIAL_OPEN_LIST: OpenListState = { status: "loading" };

export function openListReducer(state: OpenListState, event: OpenListEvent): OpenListState {
  switch (event.type) {
    case "loaded":
      return {
        status: "ready",
        subtasks: event.response.subtasks,
        offsetMs: clockOffsetMs(event.response.server_time, event.receivedAt),
        failures: 0,
        entering: state.status === "ready" ? state.entering : event.response.subtasks.map((s) => s.claim_code),
        announcement: arrivalAnnouncement(
          state.status === "ready" ? state.subtasks.map((s) => s.claim_code) : null,
          event.response.subtasks,
        ),
      };
    case "failed":
      if (state.status === "ready") return { ...state, failures: state.failures + 1, announcement: null };
      return { status: "error", failures: state.status === "error" ? state.failures + 1 : 1 };
    case "retry":
      return state.status === "error" ? INITIAL_OPEN_LIST : state;
  }
}
