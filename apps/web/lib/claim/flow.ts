/**
 * The claim page flow (PRD 9.2), as pure functions over the server's ClaimView.
 * The server owns the state; the page only adds whether the helper skipped the photo.
 */
import { MAX_PIN_ATTEMPTS, type ClaimView } from "@agent-pledge/shared";
import { ApiError } from "../api/client";
import { plainMessage } from "./plain-words";

export const OFFLINE_MESSAGE = "No connection. Check your signal and try again.";

/** The screen the claim page shows. */
export type ClaimStep = "claim" | "photo" | "pin" | "paying" | "paid" | "already_claimed" | "expired" | "locked";

export function stepFor(view: ClaimView, { photoSkipped }: { photoSkipped: boolean }): ClaimStep {
  switch (view.state) {
    case "open":
      return "claim";
    case "claimed_by_you": {
      const pinTried = view.pin_attempts_left < MAX_PIN_ATTEMPTS;
      return view.photo || photoSkipped || pinTried ? "pin" : "photo";
    }
    default:
      return view.state;
  }
}

/**
 * The line under the spinner while the server records the claim (usually 4 to
 * 8 seconds). Plain words only (PRD R7): the helper never hears how it works.
 */
export function claimingMessage(elapsedMs: number): string {
  if (elapsedMs >= 20_000) return "This is slower than usual. Keep this page open.";
  if (elapsedMs >= 8_000) return "Still working. This can take a few more seconds.";
  return "Holding this sub-task for you…";
}

/**
 * What a failed claim, photo or PIN call means for the page:
 * - state: the sub-task is closed to this phone; show that screen
 * - retry: the server said no for a passing reason; stay on the step and show the message
 *   (in plain words: a message about the plumbing becomes a generic one)
 * - recheck: no answer reached the phone, so the call may have worked; reload the claim before retrying
 */
export type ErrorOutcome =
  | { kind: "state"; view: ClaimView }
  | { kind: "retry"; message: string }
  | { kind: "recheck"; message: string };

export function afterError(view: ClaimView, error: unknown): ErrorOutcome {
  if (!(error instanceof ApiError)) return { kind: "recheck", message: OFFLINE_MESSAGE };
  switch (error.code) {
    case "already_claimed":
      return { kind: "state", view: { ...view, state: "already_claimed" } };
    case "expired":
      return { kind: "state", view: { ...view, state: "expired" } };
    case "locked":
      return { kind: "state", view: { ...view, state: "locked", pin_attempts_left: 0 } };
    default:
      return { kind: "retry", message: plainMessage(error.message) };
  }
}
