/**
 * The claim page flow (PRD 9.2), as pure functions over the server's ClaimView.
 * The server owns the state; the page only adds whether the helper skipped the photo.
 */
import { MAX_PIN_ATTEMPTS, type ClaimView, type ProofMode } from "@/lib/contract";
import { ApiError } from "../api/client";
import { plainMessage } from "./plain-words";

export const OFFLINE_MESSAGE = "No connection. Check your signal and try again.";

/** The screen the claim page shows. */
export type ClaimStep =
  "claim" | "photo" | "pin" | "paying" | "paid" | "already_claimed" | "expired" | "locked";

/**
 * The screen for a claim view. Photo mode: claim, then the proof photo (which
 * pays), then paid. PIN mode: claim, an optional photo, the PIN, then paid.
 * `sending`: a photo upload is sent and waiting for its answer, which in photo
 * mode is the payout, so the page already shows "Paying you".
 */
export function stepFor(
  view: Pick<ClaimView, "state" | "proof" | "photo" | "pin_attempts_left">,
  { photoSkipped, sending = false }: { photoSkipped: boolean; sending?: boolean },
): ClaimStep {
  switch (view.state) {
    case "open":
      return "claim";
    case "claimed_by_you": {
      if (view.proof === "photo") return sending ? "paying" : "photo";
      const pinTried = view.pin_attempts_left < MAX_PIN_ATTEMPTS;
      return view.photo || photoSkipped || pinTried ? "pin" : "photo";
    }
    default:
      return view.state;
  }
}

/** The progress bar's steps: Claim, Proof, Paid in photo mode; Claim, Photo, PIN, Paid in PIN mode. */
export const PROGRESS_STEPS: Record<ProofMode, readonly string[]> = {
  photo: ["Claim", "Proof", "Paid"],
  pin: ["Claim", "Photo", "PIN", "Paid"],
};

/**
 * Where a step sits on the progress bar, and whether it is still running
 * (paying: on the last segment, not done yet). Null for the closed states.
 */
export function progressFor(
  step: ClaimStep,
  proof: ProofMode,
): { index: number; running: boolean } | null {
  const last = PROGRESS_STEPS[proof].length - 1;
  switch (step) {
    case "claim":
      return { index: 0, running: false };
    case "photo":
      return { index: 1, running: false };
    case "pin":
      return proof === "pin" ? { index: 2, running: false } : null;
    case "paying":
      return { index: last, running: true };
    case "paid":
      return { index: last, running: false };
    default:
      return null;
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
