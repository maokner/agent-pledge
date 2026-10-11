"use client";

import type { ClaimView } from "@agent-pledge/shared";
import { useCallback, useEffect, useState } from "react";
import { ApiError, errorMessage, getApiClient } from "../api";
import { useNow } from "../use-now";
import { clockOffsetMs, msLeft } from "./clock";

export type ClaimLoad =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "ready"; view: ClaimView; offsetMs: number };

const PAYING_POLL_MS = 2000;
const TIME_UP_POLL_MS = 3000;

/**
 * Loads /claim/:code and keeps it fresh: polls while the payout is pending and
 * after the deadline (until the server marks it expired), and reloads when the
 * helper comes back to the tab (for example from the camera app).
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
        setLoad((prev) => (prev.status === "ready" ? prev : { status: "error", message: errorMessage(error) }));
      }
      return null;
    }
  }, [code, accept]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = load.status === "ready" ? load.view.state : null;
  /** Milliseconds left on the server's clock; null until loaded and mounted. */
  const left = load.status === "ready" && now !== null ? msLeft(load.view.subtask.deadline_at, now, load.offsetMs) : null;
  const timeUp = (state === "open" || state === "claimed_by_you") && left === 0;
  const pollMs = state === "paying" ? PAYING_POLL_MS : timeUp ? TIME_UP_POLL_MS : null;
  useEffect(() => {
    if (pollMs === null) return;
    // At the deadline, ask at once; while paying, the last answer is fresh.
    if (pollMs === TIME_UP_POLL_MS) void refresh();
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, refresh]);

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
