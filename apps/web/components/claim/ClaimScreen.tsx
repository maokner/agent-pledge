"use client";

/* eslint-disable @next/next/no-img-element -- the photo URL comes from the API server */

import { MAX_PIN_ATTEMPTS, type ClaimView } from "@agent-pledge/shared";
import { CircleCheck, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { HumanHeader } from "@/components/human/HumanHeader";
import { Notice } from "@/components/human/Notice";
import { stepFor } from "@/lib/claim/flow";
import { useClaim } from "@/lib/claim/use-claim";
import { ClaimButton } from "./ClaimButton";
import { ClaimClosed } from "./ClaimClosed";
import { PaidView } from "./PaidView";
import { PayingView } from "./PayingView";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-2 pb-12 sm:px-5">
      <HumanHeader />

      {load.status === "loading" && <LoadingCard />}
      {load.status === "not_found" && (
        <Step>
          <ClaimClosed reason="not_found" />
        </Step>
      )}
      {load.status === "error" && (
        <Notice
          tone="danger"
          title="This sub-task did not load"
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
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const step = stepFor(view, { photoSkipped });

  let content: React.ReactNode;
  switch (step) {
    case "claim":
      content = (
        <>
          <SubtaskSummary view={view} left={left} />
          <ClaimButton view={view} timeUp={timeUp} onUpdate={onUpdate} refresh={refresh} />
        </>
      );
      break;
    case "photo":
    case "pin":
      content = (
        <>
          <Notice tone="success" title="It is yours.">
            Finish it before the time runs out.
          </Notice>
          <SubtaskSummary view={view} left={left} compact />
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
      content = <PayingView view={view} />;
      break;
    case "paid":
      content = <PaidView view={view} />;
      break;
    default:
      content = (
        <>
          <ClaimClosed reason={step} />
          <SubtaskSummary view={view} left={left} compact />
        </>
      );
  }
  // Keyed by step, so each new step fades up once.
  return <Step key={step}>{content}</Step>;
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

function LoadingCard() {
  return (
    <section aria-busy="true" aria-label="Loading the sub-task" className="flex flex-col gap-5">
      <div className="h-72 rounded-2xl bg-human-muted motion-safe:animate-pulse" />
      <div className="h-14 rounded-xl bg-human-muted motion-safe:animate-pulse" />
      <p className="text-center text-lg text-human-muted-fg">Loading the sub-task…</p>
    </section>
  );
}
