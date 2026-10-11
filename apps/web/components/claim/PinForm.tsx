"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { useState } from "react";
import { errorMessage, getApiClient } from "@/lib/api";

/** PIN entry (PRD 9.2 step 6). Three wrong PINs lock the sub-task. */
export function PinForm({ claim, onUpdate }: { claim: ClaimView; onUpdate: (claim: ClaimView) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(form: FormData) {
    setBusy(true);
    setMessage(null);
    try {
      const { result, claim: next } = await getApiClient().submitPin(claim.code, String(form.get("pin") ?? ""));
      if (result === "wrong") setMessage(`Wrong PIN. ${next.pin_attempts_left} tries left.`);
      onUpdate(next);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Enter the PIN</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">The requester tells you the PIN when they reach the seat.</p>
      <input
        name="pin"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{4}"
        maxLength={4}
        required
        aria-label="4-digit PIN"
        className="rounded-lg border border-zinc-300 px-3 py-3 text-center font-mono text-3xl tracking-[0.5em] dark:border-zinc-600 dark:bg-zinc-900"
      />
      <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-3 text-lg font-bold text-white disabled:opacity-60">
        {busy ? "Checking…" : "Submit PIN"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Tries left: {claim.pin_attempts_left}</p>
      {message && <p className="font-medium text-rose-700 dark:text-rose-300">{message}</p>}
    </form>
  );
}
