"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { RotateCw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/human/Button";
import { Notice } from "@/components/human/Notice";
import { getApiClient } from "@/lib/api";
import { afterError, claimingMessage } from "@/lib/claim/flow";
import { useNow } from "@/lib/use-now";

/**
 * The one "Claim" button (PRD 9.2 steps 2 to 4). The server sets the helper up
 * and records the claim, which takes 4 to 8 seconds. A 409 shows
 * "Already claimed"; a lost response re-checks the server before offering a retry.
 */
export function ClaimButton({
  view,
  timeUp,
  onUpdate,
  refresh,
}: {
  view: ClaimView;
  timeUp: boolean;
  onUpdate: (view: ClaimView) => void;
  refresh: () => Promise<ClaimView | null>;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const now = useNow(1000);
  const busy = startedAt !== null;

  async function claim() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStartedAt(Date.now());
    setError(null);
    try {
      onUpdate(await getApiClient().claimSubtask(view.code));
    } catch (e) {
      const outcome = afterError(view, e);
      if (outcome.kind === "state") {
        onUpdate(outcome.view);
      } else if (outcome.kind === "retry") {
        setError(outcome.message);
      } else {
        // The claim may have gone through before the connection dropped.
        const fresh = await refresh();
        if (!fresh || fresh.state === "open") setError(outcome.message);
      }
    } finally {
      inFlight.current = false;
      setStartedAt(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={claim}
        busy={busy}
        busyLabel="Claiming…"
        disabled={timeUp}
        trailingArrow={!timeUp && !error}
        icon={error && !timeUp ? <RotateCw aria-hidden="true" className="size-5" /> : undefined}
        className="text-xl"
      >
        {timeUp ? "Time is up" : error ? "Try again" : "Claim"}
      </Button>
      <p aria-live="polite" className="text-center text-base text-human-muted-fg empty:hidden">
        {busy
          ? claimingMessage(now === null ? 0 : Math.max(0, now - startedAt))
          : error
            ? ""
            : "First to tap gets it. No account or app needed."}
      </p>
      {error && !busy && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
