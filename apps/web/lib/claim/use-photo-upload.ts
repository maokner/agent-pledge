"use client";

import type { ClaimView } from "@/lib/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiClient } from "../api";
import { afterError } from "./flow";
import { PhotoError, preparePhoto } from "./prepare-photo";

export type Picked = { file: File; previewUrl: string };
export type UploadPhase = "idle" | "preparing" | "uploading";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * The proof photo: picking, the preview, the upload with progress, cancel and
 * retry. It lives above the photo form, so that in photo mode the page can show
 * "Paying you" while the upload waits for its answer (the payout) without
 * cancelling it, and can bring the form back with the photo if it fails.
 */
export function usePhotoUpload({
  view,
  onUpdate,
  refresh,
}: {
  view: ClaimView;
  onUpdate: (view: ClaimView) => void;
  refresh: () => Promise<ClaimView | null>;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<AbortController | null>(null);

  // Free the preview when it changes or the page goes; stop an upload if the page goes.
  useEffect(() => () => void (picked && URL.revokeObjectURL(picked.previewUrl)), [picked]);
  useEffect(() => () => upload.current?.abort(), []);

  const pick = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same photo again still fires
    if (!file) return;
    setPhase("preparing");
    setError(null);
    try {
      const prepared = await preparePhoto(file);
      setPicked({ file: prepared, previewUrl: URL.createObjectURL(prepared) });
    } catch (e) {
      setError(
        e instanceof PhotoError ? e.message : "This photo could not be read. Try another one.",
      );
    } finally {
      setPhase("idle");
    }
  }, []);

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
      } else if (outcome.kind === "retry" && view.proof === "pin") {
        setError(outcome.message);
      } else {
        // The photo may have arrived before the call failed (a lost answer, or in photo mode
        // a ledger error after the photo was kept). If it did, the claim shows it, and in
        // photo mode the page goes on to pay.
        const fresh = await refresh();
        if (!fresh?.photo) {
          setError(
            outcome.kind === "recheck"
              ? `${outcome.message} Your photo is still here.`
              : outcome.message,
          );
        }
      }
    } finally {
      upload.current = null;
      setPhase("idle");
    }
  }

  return {
    picked,
    note,
    setNote,
    phase,
    progress,
    error,
    pick,
    send,
    cancel: () => upload.current?.abort(),
    /** Every byte is sent and the answer has not come yet (in photo mode: the payout). */
    awaitingAnswer: phase === "uploading" && progress >= 1,
    uploading: phase === "uploading",
  };
}

export type PhotoUpload = ReturnType<typeof usePhotoUpload>;
