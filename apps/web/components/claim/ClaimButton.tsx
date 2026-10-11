"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { useRef, useState } from "react";
import { getApiClient } from "@/lib/api";
import { afterError, claimingMessage } from "@/lib/claim/flow";
import { useNow } from "@/lib/use-now";
import { ErrorNotice, PRIMARY_BUTTON, Spinner } from "./parts";

/**
 * The one "Claim" button (PRD 9.2 steps 2 to 4). The server makes the helper's
 * wallet and accepts the NFT offer, which takes 4 to 8 seconds. A 409 shows
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
      <button type="button" onClick={claim} disabled={busy || timeUp} aria-busy={busy} className={PRIMARY_BUTTON}>
        {busy ? (
          <>
            <Spinner /> Claiming…
          </>
        ) : timeUp ? (
          "Time is up"
        ) : error ? (
          "Try again"
        ) : (
          "Claim"
        )}
      </button>
      <p aria-live="polite" className="text-center text-lg text-zinc-700 empty:hidden dark:text-zinc-300">
        {busy
          ? claimingMessage(now === null ? 0 : Math.max(0, now - startedAt))
          : error
            ? ""
            : "First to tap gets it. You do not need a wallet or an account."}
      </p>
      {error && !busy && <ErrorNotice message={error} />}
    </div>
  );
}
