"use client";
/* eslint-disable @next/next/no-img-element -- the photo URL comes from the API server */

import type { ClaimView } from "@agent-pledge/shared";
import { useState } from "react";
import { errorMessage, getApiClient } from "@/lib/api";

/** Photo and short note (PRD 9.2 step 5). */
export function PhotoForm({ claim, onUpdate }: { claim: ClaimView; onUpdate: (claim: ClaimView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    const photo = form.get("photo");
    if (!(photo instanceof Blob) || photo.size === 0) {
      setError("Choose a photo first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onUpdate(await getApiClient().uploadPhoto(claim.code, photo, String(form.get("note") ?? "")));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (claim.photo) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Your photo</h2>
        <img src={claim.photo.url} alt="Your photo of the saved seat" className="w-full rounded-lg" />
        {claim.photo.note && <p>{claim.photo.note}</p>}
      </section>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Add a photo of the seat</h2>
      <input type="file" name="photo" accept="image/*" capture="environment" className="text-base" />
      <input
        type="text"
        name="note"
        placeholder="Front table, left side"
        maxLength={140}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-900"
      />
      <button type="submit" disabled={busy} className="rounded-lg bg-zinc-900 px-4 py-3 font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900">
        {busy ? "Uploading…" : "Add photo"}
      </button>
      {error && <p className="text-rose-700 dark:text-rose-300">{error}</p>}
    </form>
  );
}
