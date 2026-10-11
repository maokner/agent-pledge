"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { useState } from "react";
import { ApiError, errorMessage, getApiClient } from "@/lib/api";

/** The one "Claim" button (PRD 9.2 step 2). Shows "Already claimed" if another phone won. */
export function ClaimButton({ code, onUpdate }: { code: string; onUpdate: (claim: ClaimView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      onUpdate(await getApiClient().claimSubtask(code));
    } catch (e) {
      if (e instanceof ApiError && (e.code === "already_claimed" || e.code === "expired")) {
        // Reload so the page shows the closed state.
        onUpdate(await getApiClient().getClaim(code));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={claim}
        disabled={busy}
        className="rounded-xl bg-emerald-600 px-6 py-4 text-xl font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? "Claiming…" : "Claim"}
      </button>
      {error && <p className="text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  );
}
