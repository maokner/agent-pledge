"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { useCallback, useEffect, useState } from "react";
import { FixtureBadge } from "@/components/ui/FixtureBadge";
import { ClaimStateBadge } from "@/components/ui/StatusBadge";
import { errorMessage, getApiClient } from "@/lib/api";
import { ClaimButton } from "./ClaimButton";
import { ClaimClosed } from "./ClaimClosed";
import { PaidView } from "./PaidView";
import { PhotoForm } from "./PhotoForm";
import { PinForm } from "./PinForm";
import { SubtaskSummary } from "./SubtaskSummary";

const POLL_MS = 2000;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; claim: ClaimView };

/**
 * The claim page (PRD 9.2) for /c/<code>. Loads the claim, then shows the
 * part of the flow that matches its state. Polls while the payout is pending.
 */
export function ClaimScreen({ code }: { code: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      setLoad({ status: "ready", claim: await getApiClient().getClaim(code) });
    } catch (error) {
      setLoad({ status: "error", message: errorMessage(error) });
    }
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    getApiClient()
      .getClaim(code)
      .then((claim) => !cancelled && setLoad({ status: "ready", claim }))
      .catch((error: unknown) => !cancelled && setLoad({ status: "error", message: errorMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  const paying = load.status === "ready" && load.claim.state === "paying";
  useEffect(() => {
    if (!paying) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [paying, refresh]);

  const onUpdate = (claim: ClaimView) => setLoad({ status: "ready", claim });

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Agent Pledge</h1>
        <FixtureBadge />
      </header>

      {load.status === "loading" && <p className="text-zinc-500">Loading…</p>}
      {load.status === "error" && <p className="rounded-lg bg-rose-50 p-4 text-rose-900 dark:bg-rose-950 dark:text-rose-100">{load.message}</p>}
      {load.status === "ready" && (
        <>
          <div className="flex justify-end">
            <ClaimStateBadge state={load.claim.state} />
          </div>
          <SubtaskSummary claim={load.claim} />
          <ClaimBody claim={load.claim} onUpdate={onUpdate} />
        </>
      )}
    </main>
  );
}

function ClaimBody({ claim, onUpdate }: { claim: ClaimView; onUpdate: (claim: ClaimView) => void }) {
  switch (claim.state) {
    case "open":
      return <ClaimButton code={claim.code} onUpdate={onUpdate} />;
    case "claimed_by_you":
      return (
        <>
          <PhotoForm claim={claim} onUpdate={onUpdate} />
          <PinForm claim={claim} onUpdate={onUpdate} />
        </>
      );
    case "paying":
    case "paid":
      return <PaidView claim={claim} />;
    case "already_claimed":
    case "expired":
    case "locked":
      return <ClaimClosed state={claim.state} />;
  }
}
