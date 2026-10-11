"use client";
/* eslint-disable @next/next/no-img-element -- previews are local object URLs */

import type { ClaimView } from "@/lib/contract";
import { Camera, Images, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { Field, Input } from "@/components/human/Input";
import { Notice } from "@/components/human/Notice";
import { ProgressBar } from "@/components/human/ProgressBar";
import { Spinner } from "@/components/human/Spinner";
import { getApiClient } from "@/lib/api";
import { afterError } from "@/lib/claim/flow";
import { PhotoError, preparePhoto } from "@/lib/claim/prepare-photo";
import { isAbortError, StepHeading } from "./parts";

const NOTE_MAX = 140;

type Picked = { file: File; previewUrl: string };
type Phase = "idle" | "preparing" | "uploading";

/**
 * Photo of the finished task (the saved seat) and a short note (PRD 2.1 step 11, 9.2 step 5).
 * Camera or gallery, a preview, upload progress, cancel and retry. Optional:
 * the helper can skip to the PIN.
 */
export function PhotoForm({
  view,
  onUpdate,
  refresh,
  onSkip,
}: {
  view: ClaimView;
  onUpdate: (view: ClaimView) => void;
  refresh: () => Promise<ClaimView | null>;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<AbortController | null>(null);

  // Free the preview when it changes or the step ends; stop an upload if the page moves on.
  useEffect(() => () => void (picked && URL.revokeObjectURL(picked.previewUrl)), [picked]);
  useEffect(() => () => upload.current?.abort(), []);

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same photo again still fires
    if (!file) return;
    setPhase("preparing");
    setError(null);
    try {
      const prepared = await preparePhoto(file);
      setPicked({ file: prepared, previewUrl: URL.createObjectURL(prepared) });
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : "This photo could not be read. Try another one.");
    } finally {
      setPhase("idle");
    }
  }

  async function send() {
    if (!picked || upload.current) return;
    const controller = new AbortController();
    upload.current = controller;
    setPhase("uploading");
    setProgress(0);
    setError(null);
    try {
      onUpdate(
        await getApiClient().uploadPhoto(view.code, picked.file, note.trim(), {
          onProgress: setProgress,
          signal: controller.signal,
        }),
      );
    } catch (e) {
      if (isAbortError(e)) return;
      const outcome = afterError(view, e);
      if (outcome.kind === "state") {
        onUpdate(outcome.view);
      } else if (outcome.kind === "retry") {
        setError(outcome.message);
      } else {
        // The photo may have arrived before the connection dropped.
        const fresh = await refresh();
        if (!fresh?.photo) setError(`${outcome.message} Your photo is still here.`);
      }
    } finally {
      upload.current = null;
      setPhase("idle");
    }
  }

  const uploading = phase === "uploading";
  const percent = Math.round(progress * 100);

  return (
    <Card as="section" className="flex flex-col gap-5" aria-labelledby="photo-step">
      <div className="flex flex-col gap-2">
        <StepHeading id="photo-step" step={2} title="Add a photo" />
        <p className="text-lg leading-relaxed text-human-muted-fg">
          Show the requester it is done, for example the seat you saved. This step is optional.
        </p>
      </div>

      {phase === "preparing" ? (
        <p
          className="flex min-h-14 items-center justify-center gap-3 rounded-xl border border-dashed border-human-border text-lg"
          aria-live="polite"
        >
          <Spinner className="text-human-accent" /> Getting your photo ready…
        </p>
      ) : picked ? (
        <div className="flex flex-col items-center gap-1">
          <img
            src={picked.previewUrl}
            alt="Your photo"
            className="max-h-80 w-full rounded-xl border border-human-border bg-human-muted object-contain"
          />
          {!uploading && (
            <label className={buttonVariants({ variant: "ghost", size: "sm", block: false })}>
              Take a different photo
              <input type="file" accept="image/*" onChange={pick} className="sr-only" />
            </label>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className={buttonVariants({ variant: "primary" })}>
            <Camera aria-hidden="true" className="size-6" /> Take a photo
            <input type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" />
          </label>
          <label className={buttonVariants({ variant: "secondary" })}>
            <Images aria-hidden="true" className="size-5" /> Choose from photos
            <input type="file" accept="image/*" onChange={pick} className="sr-only" />
          </label>
        </div>
      )}

      <Field label="Note" optional>
        <Input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          placeholder="Front table, left side"
          enterKeyHint="done"
          autoComplete="off"
          disabled={uploading}
        />
      </Field>

      {uploading ? (
        <div className="flex flex-col gap-2">
          <ProgressBar value={progress} label="Sending your photo" />
          <p className="flex items-center justify-between gap-3 text-lg" aria-live="polite">
            <span className="flex items-center gap-2 tabular-nums">
              <Spinner className="text-human-accent" />
              {percent < 100 ? `Sending… ${percent}%` : "Almost done…"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => upload.current?.abort()} className="w-auto">
              Cancel
            </Button>
          </p>
        </div>
      ) : (
        picked && (
          <Button
            onClick={send}
            trailingArrow={!error}
            icon={error ? <RotateCw aria-hidden="true" className="size-5" /> : undefined}
          >
            {error ? "Try again" : "Send photo"}
          </Button>
        )
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <Button variant="ghost" size="sm" onClick={onSkip} disabled={uploading}>
        Skip and enter the PIN
      </Button>
    </Card>
  );
}
