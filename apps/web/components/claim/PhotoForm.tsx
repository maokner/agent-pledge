"use client";
/* eslint-disable @next/next/no-img-element -- previews are local object URLs */

import type { ClaimView } from "@agent-pledge/shared";
import { useEffect, useRef, useState } from "react";
import { getApiClient } from "@/lib/api";
import { afterError } from "@/lib/claim/flow";
import { PhotoError, preparePhoto } from "@/lib/claim/prepare-photo";
import { ErrorNotice, isAbortError, PRIMARY_BUTTON, SECONDARY_BUTTON, Spinner, StepHeading, TEXT_BUTTON } from "./parts";

const NOTE_MAX = 140;

type Picked = { file: File; previewUrl: string };
type Phase = "idle" | "preparing" | "uploading";

/**
 * Photo of the saved seat and a short note (PRD 2.1 step 11, 9.2 step 5).
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
    <section className="flex flex-col gap-4" aria-labelledby="photo-step">
      <StepHeading id="photo-step" step={2} title="Add a photo of the seat" />
      <p className="-mt-2 text-lg text-zinc-700 dark:text-zinc-300">
        It shows the requester where you saved it. This step is optional.
      </p>

      {phase === "preparing" ? (
        <p className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-zinc-100 text-lg dark:bg-zinc-800" aria-live="polite">
          <Spinner /> Getting your photo ready…
        </p>
      ) : picked ? (
        <div className="flex flex-col items-center gap-1">
          <img src={picked.previewUrl} alt="Your photo of the saved seat" className="max-h-80 w-full rounded-2xl bg-zinc-100 object-contain dark:bg-zinc-800" />
          {!uploading && (
            <label className={`${TEXT_BUTTON} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500`}>
              Take a different photo
              <input type="file" accept="image/*" onChange={pick} className="sr-only" />
            </label>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className={`${PRIMARY_BUTTON} cursor-pointer has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-emerald-300`}>
            <CameraIcon /> Take a photo
            <input type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" />
          </label>
          <label className={`${SECONDARY_BUTTON} cursor-pointer has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-emerald-300`}>
            Choose from your photos
            <input type="file" accept="image/*" onChange={pick} className="sr-only" />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-lg font-medium">
        <span>
          Note <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
        </span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          placeholder="Front table, left side"
          enterKeyHint="done"
          autoComplete="off"
          disabled={uploading}
          className="min-h-14 rounded-2xl border-2 border-zinc-300 bg-white px-4 text-lg outline-none focus:border-emerald-600 disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
        />
      </label>

      {uploading ? (
        <div className="flex flex-col gap-3">
          <div
            role="progressbar"
            aria-label="Sending your photo"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-4 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          >
            <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          <p className="flex items-center justify-between text-lg" aria-live="polite">
            <span>{percent < 100 ? `Sending… ${percent}%` : "Almost done…"}</span>
            <button type="button" onClick={() => upload.current?.abort()} className={TEXT_BUTTON}>
              Cancel
            </button>
          </p>
        </div>
      ) : (
        picked && (
          <button type="button" onClick={send} className={PRIMARY_BUTTON}>
            {error ? "Try again" : "Send photo"}
          </button>
        )
      )}

      {error && <ErrorNotice message={error} />}

      <button type="button" onClick={onSkip} disabled={uploading} className={TEXT_BUTTON}>
        Skip and enter the PIN
      </button>
    </section>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}
