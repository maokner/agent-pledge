"use client";

import type { ClaimView } from "@/lib/contract";
import { useCallback, useEffect, useState } from "react";
import { ApiError, errorMessage, getApiClient } from "../api";
import { useNow } from "../use-now";
import { clockOffsetMs, msLeft } from "./clock";
import { LEDGER_POLL_MS, shouldPollLedger } from "./ledger";
import { plainMessage } from "./plain-words";

export type ClaimLoad =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "ready"; view: ClaimView; offsetMs: number };

/**
 * Loads /claim/:code and keeps it fresh: polls every LEDGER_POLL_MS from the
 * claim until the NFT is burned (so the payout and every transaction show up as
 * they happen) and after the deadline (until the server marks it expired), and
 * reloads when the helper comes back to the tab (for example from the camera app).
 */
export function useClaim(code: string) {
  const [load, setLoad] = useState<ClaimLoad>({ status: "loading" });
  const now = useNow(1000);

  const accept = useCallback((view: ClaimView) => {
    setLoad({ status: "ready", view, offsetMs: clockOffsetMs(view.server_time, Date.now()) });
  }, []);

  /** Reloads the claim. Returns the new view, or null if it could not load (the last good view stays). */
  const refresh = useCallback(async (): Promise<ClaimView | null> => {
    try {
      const view = await getApiClient().getClaim(code);
      accept(view);
      return view;
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") {
        setLoad({ status: "not_found" });
      } else {
        setLoad((prev) =>
          prev.status === "ready"
            ? prev
            : { status: "error", message: plainMessage(errorMessage(error)) },
        );
      }
      return null;
    }
  }, [code, accept]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = load.status === "ready" ? load.view.state : null;
  /** Milliseconds left on the server's clock; null until loaded and mounted. */
  const left =
    load.status === "ready" && now !== null
      ? msLeft(load.view.subtask.deadline_at, now, load.offsetMs)
      : null;
  const timeUp = (state === "open" || state === "claimed_by_you") && left === 0;
  const ledgerMoving = load.status === "ready" && shouldPollLedger(load.view);
  const polling = ledgerMoving || timeUp;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(refresh, LEDGER_POLL_MS);
    return () => clearInterval(timer);
  }, [polling, refresh]);
  useEffect(() => {
    // At the deadline, ask at once.
    if (timeUp) void refresh();
  }, [timeUp, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    void refresh();
  }, [refresh]);

  return { load, left, timeUp, accept, refresh, retry };
}
