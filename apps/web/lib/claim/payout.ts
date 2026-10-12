/**
 * Photo mode's payout (the proof photo pays the helper). The photo call
 * usually comes back paid. When it does not (it returned no payout, failed
 * with a ledger error, or its answer was lost), the claim is "paying" and the
 * page asks the server to pay with POST /claim/:code/pay, which is idempotent,
 * while it keeps reloading the claim (LEDGER_POLL_MS) until the payout is in.
 */
import type { ClaimView } from "@/lib/contract";
import { ApiError } from "../api/client";

/** How long to wait before asking again after a pay call that failed for a passing reason. */
export const PAY_RETRY_MS = 6000;

/**
 * Whether the page should ask the server to pay: photo mode, paying, no payout
 * yet, and no photo upload still waiting for its answer (that call may still pay).
 */
export function needsPayCall(
  view: Pick<ClaimView, "proof" | "state" | "payout">,
  { uploading }: { uploading: boolean },
): boolean {
  return view.proof === "photo" && view.state === "paying" && !view.payout && !uploading;
}

/**
 * After a failed pay call: "retry" for a passing failure (the ledger, the
 * server, the signal), "stop" when the server says pay does not apply (no
 * photo yet, PIN mode, not this phone's claim, time is up). After "stop" the
 * page reloads the claim to show where it really is.
 */
export function afterPayError(error: unknown): "retry" | "stop" {
  if (!(error instanceof ApiError)) return "retry";
  switch (error.code) {
    case "conflict":
    case "not_your_claim":
    case "unauthorized":
    case "not_found":
    case "expired":
    case "locked":
    case "already_claimed":
    case "bad_request":
      return "stop";
    default:
      return "retry";
  }
}

export interface PayUntilPaidOptions {
  pay: () => Promise<ClaimView>;
  /** The pay call's answer (the claim, paid). */
  onPaid: (view: ClaimView) => void;
  /** Pay does not apply: reload the claim. */
  onStop: (error: unknown) => void;
  signal: AbortSignal;
  retryMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Calls pay until it answers, waiting `retryMs` after each passing failure.
 * Ends quietly once `signal` aborts (the claim was paid some other way, or the page moved on).
 */
export async function payUntilPaid({
  pay,
  onPaid,
  onStop,
  signal,
  retryMs = PAY_RETRY_MS,
  sleep = abortableSleep,
}: PayUntilPaidOptions): Promise<void> {
  while (!signal.aborted) {
    try {
      const view = await pay();
      if (!signal.aborted) onPaid(view);
      return;
    } catch (error) {
      if (signal.aborted) return;
      if (afterPayError(error) === "stop") {
        onStop(error);
        return;
      }
      await sleep(retryMs, signal);
    }
  }
}

/** Resolves after `ms`, or at once when `signal` aborts. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * The line under "Paying you" (photo and PIN mode), by how long it has taken.
 * One ledger close is 3 to 5 seconds; a payout is two transactions.
 */
export function payingMessage(elapsedMs: number): string {
  if (elapsedMs >= 30_000) return "This is slower than usual. Keep this page open, it will finish.";
  if (elapsedMs >= 12_000) return "Still working. This can take a few more seconds.";
  return "Paying you on the XRPL… This takes a few seconds.";
}
