/** PIN entry on the claim page (PRD 3 R8): 4 digits, three tries. */
import { MAX_PIN_ATTEMPTS, type SubmitPinResponse } from "@agent-pledge/shared";

export const PIN_LENGTH = 4;

/** Digits only (ASCII), at most 4: what the PIN field keeps from typing or pasting. */
export function sanitizePin(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, PIN_LENGTH);
}

function attempts(n: number): string {
  return `${n} attempt${n === 1 ? "" : "s"} left`;
}

/** The message after a PIN answer from the server, or null when there is nothing to say. */
export function pinFeedback(result: SubmitPinResponse["result"], attemptsLeft: number): string | null {
  switch (result) {
    case "wrong":
      return `Wrong PIN, ${attempts(attemptsLeft)}`;
    case "locked":
      return "Locked";
    case "correct":
      return null;
  }
}

/** A standing reminder once a PIN has been wrong, for example after the page reloads. */
export function attemptsLeftHint(attemptsLeft: number): string | null {
  if (attemptsLeft >= MAX_PIN_ATTEMPTS) return null;
  if (attemptsLeft === 1) return `${attempts(1)}. One more wrong PIN locks this task.`;
  return `${attempts(attemptsLeft)}.`;
}
