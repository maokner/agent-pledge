"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { useRef, useState } from "react";
import { getApiClient } from "@/lib/api";
import { afterError } from "@/lib/claim/flow";
import { attemptsLeftHint, PIN_LENGTH, pinFeedback, sanitizePin } from "@/lib/claim/pin";
import { ErrorNotice, PRIMARY_BUTTON, Spinner, StepHeading } from "./parts";

/**
 * PIN entry (PRD 2.1 step 12, 3 R8, 9.2 step 6). A 4-digit field that opens the
 * number keypad. Wrong PINs count down; the third locks the sub-task. One
 * request at a time, so a double tap cannot spend two attempts.
 */
export function PinForm({
  view,
  onUpdate,
  refresh,
}: {
  view: ClaimView;
  onUpdate: (view: ClaimView) => void;
  refresh: () => Promise<ClaimView | null>;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || pin.length !== PIN_LENGTH) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { result, claim } = await getApiClient().submitPin(view.code, pin);
      setFeedback(pinFeedback(result, claim.pin_attempts_left));
      if (result === "wrong") {
        setPin("");
        input.current?.focus();
      }
      onUpdate(claim);
    } catch (e) {
      const outcome = afterError(view, e);
      if (outcome.kind === "state") {
        onUpdate(outcome.view);
      } else if (outcome.kind === "retry") {
        setError(outcome.message);
      } else {
        // The PIN may have been checked before the connection dropped.
        const fresh = await refresh();
        if (!fresh || fresh.state === "claimed_by_you") setError(outcome.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const hint = feedback ? null : attemptsLeftHint(view.pin_attempts_left);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-labelledby="pin-step" noValidate>
      <StepHeading id="pin-step" step={3} title="Enter the PIN" />
      <p className="-mt-2 text-lg text-zinc-700 dark:text-zinc-300">
        When the requester arrives, ask them for their 4-digit PIN. You get paid when it is right.
      </p>
      <input
        ref={input}
        name="pin"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        enterKeyHint="go"
        maxLength={PIN_LENGTH}
        value={pin}
        onChange={(e) => setPin(sanitizePin(e.target.value))}
        disabled={busy}
        placeholder="••••"
        aria-label="4-digit PIN"
        aria-invalid={feedback !== null}
        aria-describedby="pin-feedback"
        className="h-20 w-full rounded-2xl border-2 border-zinc-300 bg-white pl-[0.6em] text-center font-mono text-5xl tracking-[0.6em] outline-none placeholder:text-zinc-300 focus:border-emerald-600 aria-[invalid=true]:border-rose-500 disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:placeholder:text-zinc-700 dark:disabled:bg-zinc-800"
      />
      <div id="pin-feedback" aria-live="assertive">
        {feedback && <p className="rounded-2xl bg-rose-50 p-4 text-xl font-bold text-rose-900 ring-1 ring-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:ring-rose-800">{feedback}</p>}
        {hint && <p className="text-lg font-medium text-amber-800 dark:text-amber-300">{hint}</p>}
      </div>
      <button type="submit" disabled={busy || pin.length !== PIN_LENGTH} aria-busy={busy} className={PRIMARY_BUTTON}>
        {busy ? (
          <>
            <Spinner /> Checking…
          </>
        ) : (
          "Check PIN"
        )}
      </button>
      {error && <ErrorNotice message={error} />}
    </form>
  );
}
