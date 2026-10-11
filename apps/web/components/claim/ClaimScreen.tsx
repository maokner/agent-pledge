"use client";

import type { ClaimView } from "@agent-pledge/shared";
import Link from "next/link";
import { useState } from "react";
import { FixtureBadge } from "@/components/ui/FixtureBadge";
import { stepFor } from "@/lib/claim/flow";
import { useClaim } from "@/lib/claim/use-claim";
import { ClaimButton } from "./ClaimButton";
import { ClaimClosed } from "./ClaimClosed";
import { PaidView } from "./PaidView";
import { ErrorNotice, SECONDARY_BUTTON } from "./parts";
import { PhotoForm } from "./PhotoForm";
import { PinForm } from "./PinForm";
import { SubtaskSummary } from "./SubtaskSummary";

/**
 * The claim page (PRD 9.2) for /c/<code>, opened on a phone from the Yik Yak post.
 * Loads the claim, then shows the step that matches its state:
 * Claim, then photo (optional), then PIN, then Paid.
 */
export function ClaimScreen({ code }: { code: string }) {
  const { load, left, timeUp, accept, refresh, retry } = useClaim(code);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-2 pb-10">
      <header className="flex min-h-12 items-center justify-between gap-3">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          Agent Pledge
        </Link>
        <FixtureBadge />
      </header>

      {load.status === "loading" && <LoadingCard />}
      {load.status === "not_found" && <ClaimClosed reason="not_found" />}
      {load.status === "error" && (
        <ErrorNotice
          message={load.message}
          action={
            <button type="button" onClick={retry} className={SECONDARY_BUTTON}>
              Try again
            </button>
          }
        />
      )}
      {load.status === "ready" && <ClaimFlow view={load.view} left={left} timeUp={timeUp} onUpdate={accept} refresh={refresh} />}
    </main>
  );
}

function ClaimFlow({
  view,
  left,
  timeUp,
  onUpdate,
  refresh,
}: {
  view: ClaimView;
  left: number | null;
  timeUp: boolean;
  onUpdate: (view: ClaimView) => void;
  refresh: () => Promise<ClaimView | null>;
}) {
  const [photoSkipped] = useState(false);
  const step = stepFor(view, { photoSkipped });

  switch (step) {
    case "claim":
      return (
        <>
          <SubtaskSummary view={view} left={left} />
          <ClaimButton view={view} timeUp={timeUp} onUpdate={onUpdate} refresh={refresh} />
        </>
      );
    case "photo":
    case "pin":
      return (
        <>
          <YoursBanner />
          <SubtaskSummary view={view} left={left} compact />
          {step === "photo" ? <PhotoForm claim={view} onUpdate={onUpdate} /> : <PinForm claim={view} onUpdate={onUpdate} />}
        </>
      );
    case "paying":
    case "paid":
      return <PaidView claim={view} />;
    default:
      return (
        <>
          <ClaimClosed reason={step} />
          <SubtaskSummary view={view} left={left} compact />
        </>
      );
  }
}

function YoursBanner() {
  return (
    <p className="rounded-2xl bg-emerald-100 p-4 text-lg font-semibold text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
      It is yours. Save the seat before the time runs out.
    </p>
  );
}

function LoadingCard() {
  return (
    <section aria-busy="true" aria-label="Loading the task" className="flex flex-col gap-4">
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-16 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">Loading the task…</p>
    </section>
  );
}
