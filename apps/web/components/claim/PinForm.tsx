"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { useRef, useState } from "react";
import { Button } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { Input } from "@/components/human/Input";
import { Notice } from "@/components/human/Notice";
import { getApiClient } from "@/lib/api";
import { afterError } from "@/lib/claim/flow";
import { attemptsLeftHint, PIN_LENGTH, pinFeedback, sanitizePin } from "@/lib/claim/pin";
import { StepHeading } from "./parts";

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
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-5" aria-labelledby="pin-step" noValidate>
        <div className="flex flex-col gap-2">
          <StepHeading id="pin-step" step={3} title="Enter the PIN" />
          <p className="text-lg leading-relaxed text-human-muted-fg">
            When the requester arrives, ask them for their 4-digit PIN. You get paid when it is right.
          </p>
        </div>
        <Input
          ref={input}
          size="code"
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
        />
        <div id="pin-feedback" aria-live="assertive" className="empty:hidden">
          {feedback && <Notice tone="danger" role="none" title={feedback} />}
          {hint && <p className="text-lg font-semibold text-human-warning">{hint}</p>}
        </div>
        <Button type="submit" disabled={pin.length !== PIN_LENGTH} busy={busy} busyLabel="Checking…">
          Check PIN
        </Button>
        {error && <Notice tone="danger">{error}</Notice>}
      </form>
    </Card>
  );
}
