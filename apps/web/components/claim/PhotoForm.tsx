"use client";
/* eslint-disable @next/next/no-img-element -- previews are local object URLs */

import type { ClaimView } from "@/lib/contract";
import { Camera, Images, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/human/Button";
import { Card } from "@/components/human/Card";
import { Field, Input } from "@/components/human/Input";
import { Notice } from "@/components/human/Notice";
import { ProgressBar } from "@/components/human/ProgressBar";
import { Spinner } from "@/components/human/Spinner";
import type { PhotoUpload } from "@/lib/claim/use-photo-upload";
import { formatRlusd } from "@/lib/format";
import { StepHeading } from "./parts";

const NOTE_MAX = 140;

/**
 * The photo of the finished task (the saved seat) and a short note (PRD 2.1 step 11, 9.2 step 5).
 * Camera or gallery, a preview, upload progress, cancel and retry.
 *
 * Photo mode (the default): the photo is the proof and sending it pays the
 * helper, so it is required and a note alone does nothing. PIN mode: the photo
 * is optional and the helper can skip to the PIN.
 */
export function PhotoForm({
  view,
  upload,
  onSkip,
}: {
  view: ClaimView;
  upload: PhotoUpload;
  onSkip: () => void;
}) {
  const { picked, note, setNote, phase, progress, error, pick, send, cancel, uploading } = upload;
  const pays = view.proof === "photo";
  const percent = Math.round(progress * 100);
  const pay = formatRlusd(view.subtask.price);

  return (
    <Card as="section" className="flex flex-col gap-5" aria-labelledby="photo-step">
      <div className="flex flex-col gap-2">
        {pays ? (
          <>
            <StepHeading id="photo-step" step={2} of={3} title="Send a photo to get paid" />
            <p className="text-lg leading-relaxed text-human-muted-fg">
              Take a photo that shows it is done, for example the seat you saved. Sending it pays
              you {pay} right away.
            </p>
          </>
        ) : (
          <>
            <StepHeading id="photo-step" step={2} of={4} title="Add a photo" />
            <p className="text-lg leading-relaxed text-human-muted-fg">
              Show the requester it is done, for example the seat you saved. This step is optional.
            </p>
          </>
        )}
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
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={pick}
              className="sr-only"
            />
          </label>
          <label className={buttonVariants({ variant: "secondary" })}>
            <Images aria-hidden="true" className="size-5" /> Choose from photos
            <input type="file" accept="image/*" onChange={pick} className="sr-only" />
          </label>
        </div>
      )}

      <Field
        label="Note"
        optional
        hint={
          pays && !picked && note.trim()
            ? "A note alone does not pay. Add the photo: it is what gets you paid."
            : undefined
        }
      >
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
            <Button variant="ghost" size="sm" onClick={cancel} className="w-auto">
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
            {error ? "Try again" : pays ? "Send photo and get paid" : "Send photo"}
          </Button>
        )
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      {!pays && (
        <Button variant="ghost" size="sm" onClick={onSkip} disabled={uploading}>
          Skip and enter the PIN
        </Button>
      )}
    </Card>
  );
}
