"use client";

/* eslint-disable @next/next/no-img-element -- the photo URL comes from the API server */

import { MAX_PIN_ATTEMPTS, type ClaimView } from "@agent-pledge/shared";
import { ArrowLeft, CircleCheck, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { Notice } from "@/components/human/Notice";
import { type ClaimStep, stepFor } from "@/lib/claim/flow";
import { useClaim } from "@/lib/claim/use-claim";
import { cn } from "@/lib/cn";
import { ClaimButton } from "./ClaimButton";
import { ClaimClosed } from "./ClaimClosed";
import { PaidView } from "./PaidView";
import { PayingView } from "./PayingView";
import { PhotoForm } from "./PhotoForm";
import { PinForm } from "./PinForm";
import { StepIndicator } from "./StepIndicator";
import { SubtaskSummary } from "./SubtaskSummary";

/** Desktop: the sub-task on the left, the step on the right. Phones: one column. */
const COLUMNS = "grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-10";

/**
 * The claim page (PRD 9.2) for /c/<code>, opened on a phone from the Yik Yak post.
 * Loads the claim, then shows the step that matches its state:
 * Claim, then photo (optional), then PIN, then Paid.
 */
export function ClaimScreen({ code }: { code: string }) {
  const { load, left, timeUp, accept, refresh, retry } = useClaim(code);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="sr-only">Claim a sub-task</h1>
        <Link
          href="/human"
          className={cn(buttonVariants({ variant: "ghost", size: "sm", block: false }), "-ml-3 w-auto gap-2 no-underline")}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          All open tasks
        </Link>
      </div>

      {load.status === "loading" && <LoadingLayout />}
      {load.status === "not_found" && (
        <div className="mx-auto w-full max-w-xl">
          <Step>
            <ClaimClosed reason="not_found" />
          </Step>
        </div>
      )}
      {load.status === "error" && (
        <Notice
          tone="danger"
          title="This sub-task did not load"
          className="mx-auto w-full max-w-xl"
          action={
            <Button variant="secondary" onClick={retry} icon={<RotateCw aria-hidden="true" className="size-5" />}>
              Try again
            </Button>
          }
        >
          {load.message}
        </Notice>
      )}
      {load.status === "ready" && <ClaimFlow view={load.view} left={left} timeUp={timeUp} onUpdate={accept} refresh={refresh} />}
    </div>
  );
}

/** Steps where the outcome matters more than the sub-task: on phones they come first. */
const OUTCOME_FIRST: readonly ClaimStep[] = ["paying", "paid", "already_claimed", "expired", "locked"];

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
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const step = stepFor(view, { photoSkipped });

  let panel: React.ReactNode;
  switch (step) {
    case "claim":
      panel = (
        <Card as="section" aria-labelledby="claim-step" className="flex flex-col gap-5 sm:p-8">
          <div className="flex flex-col gap-2">
            <h2 id="claim-step" className="text-2xl font-semibold leading-tight tracking-[-0.01em]">
              Claim it
            </h2>
            <p className="text-lg leading-relaxed text-human-muted-fg">
              Tap Claim to hold this sub-task. Then do it before the time runs out.
            </p>
          </div>
          <ClaimButton view={view} timeUp={timeUp} onUpdate={onUpdate} refresh={refresh} />
        </Card>
      );
      break;
    case "photo":
    case "pin":
      panel = (
        <>
          <Notice tone="success" title="It is yours.">
            Finish it before the time runs out.
          </Notice>
          {step === "photo" ? (
            <PhotoForm view={view} onUpdate={onUpdate} refresh={refresh} onSkip={() => setPhotoSkipped(true)} />
          ) : (
            <>
              <PhotoRecap view={view} onAddPhoto={() => setPhotoSkipped(false)} />
              <PinForm view={view} onUpdate={onUpdate} refresh={refresh} />
            </>
          )}
        </>
      );
      break;
    case "paying":
      panel = <PayingView view={view} />;
      break;
    case "paid":
      panel = <PaidView view={view} />;
      break;
    default:
      panel = <ClaimClosed reason={step} />;
  }

  return (
    <div className={COLUMNS}>
      <div className={cn(OUTCOME_FIRST.includes(step) && "order-2 lg:order-none")}>
        <SubtaskSummary view={view} left={left} compact={step !== "claim"} />
      </div>
      <div className="flex flex-col gap-5 lg:sticky lg:top-24">
        <StepIndicator step={step} />
        {/* Keyed by step, so each new step fades up once. */}
        <Step key={step}>{panel}</Step>
      </div>
    </div>
  );
}

/** One step's content, fading up as it arrives (not under reduced motion). */
function Step({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-5 motion-safe:animate-human-fade-up">{children}</div>;
}

/** On the PIN step: the photo that was sent, or a way back to add one. */
function PhotoRecap({ view, onAddPhoto }: { view: ClaimView; onAddPhoto: () => void }) {
  if (view.photo) {
    return (
      <Card padding="sm" className="flex items-center gap-4">
        <img src={view.photo.url} alt="Your photo" className="size-20 shrink-0 rounded-xl border border-human-border object-cover" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheck aria-hidden="true" className="size-5 text-human-success" />
            Photo sent
          </p>
          {view.photo.note && <p className="break-words text-base text-human-muted-fg">{view.photo.note}</p>}
        </div>
      </Card>
    );
  }
  if (view.pin_attempts_left < MAX_PIN_ATTEMPTS) return null;
  return (
    <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-human-border py-1 pr-1 pl-4 text-lg">
      No photo yet.
      <Button variant="ghost" size="sm" onClick={onAddPhoto} className="w-auto">
        Add a photo
      </Button>
    </p>
  );
}

/** Skeletons in the page's shape: the sub-task card and the step panel. */
function LoadingLayout() {
  const bar = "rounded-lg bg-human-muted motion-safe:animate-pulse";
  return (
    <div aria-busy="true" aria-label="Loading the sub-task" role="group" className="flex flex-col gap-5">
      <div aria-hidden="true" className={COLUMNS}>
        <div className="rounded-2xl border border-human-border bg-human-card p-6 shadow-human-md sm:p-8 lg:p-10">
          <div className={cn(bar, "size-18 rounded-3xl sm:size-22")} />
          <div className={cn(bar, "mt-8 h-4 w-20")} />
          <div className={cn(bar, "mt-3 h-16 w-44 lg:h-18 lg:w-56")} />
          <div className={cn(bar, "mt-5 h-7 w-4/5")} />
          <div className={cn(bar, "mt-8 h-12 w-3/5")} />
        </div>
        <div className="flex flex-col gap-5">
          <div className={cn(bar, "hidden h-16 rounded-2xl lg:block")} />
          <div className="rounded-2xl border border-human-border bg-human-card p-6 shadow-human-md sm:p-8">
            <div className={cn(bar, "h-7 w-32")} />
            <div className={cn(bar, "mt-3 h-5 w-full")} />
            <div className={cn(bar, "mt-6 h-14 w-full rounded-xl")} />
          </div>
        </div>
      </div>
      <p className="text-center text-lg text-human-muted-fg">Loading the sub-task…</p>
    </div>
  );
}
