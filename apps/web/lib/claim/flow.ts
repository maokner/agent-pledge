/**
 * The claim page flow (PRD 9.2), as pure functions over the server's ClaimView.
 * The server owns the state; the page only adds whether the helper skipped the photo.
 */
import { MAX_PIN_ATTEMPTS, type ClaimView } from "@agent-pledge/shared";
import { ApiError } from "../api/client";

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

/** The line under the spinner while the claim goes through the ledger (usually 4 to 8 seconds). */
export function claimingMessage(elapsedMs: number): string {
  if (elapsedMs >= 20_000) return "This is slower than usual. Keep this page open.";
  if (elapsedMs >= 8_000) return "Still working. The ledger can take a few more seconds.";
  return "Reserving this for you on the XRP Ledger…";
}

/**
 * What a failed claim, photo or PIN call means for the page:
 * - state: the sub-task is closed to this phone; show that screen
 * - retry: the server said no for a passing reason; stay on the step and show the message
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
      return { kind: "retry", message: error.message };
  }
}
