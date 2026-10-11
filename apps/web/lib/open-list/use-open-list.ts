"use client";

import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import { getApiClient } from "../api";
import { INITIAL_OPEN_LIST, openListReducer, type OpenListState } from "./feed";
import { type FetchTrigger, planFetch } from "./schedule";

/**
 * Loads the open sub-tasks for /human and keeps them fresh (see planFetch):
 * polls while the tab is visible, fetches at once when the Helper comes back
 * to the tab or the phone comes back online, and backs off after failures
 * while keeping the last list on screen.
 *
 * All data comes through getApiClient().listOpenSubtasks(), so the source
 * (the DRAFT GET /subtasks/open, or a list derived from /board/state) can
 * change without touching the page.
 */
export function useOpenList() {
  const [state, dispatch] = useReducer(openListReducer, INITIAL_OPEN_LIST);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true);
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);

  const inFlight = useRef(false);
  const stateRef = useRef<OpenListState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fetchNow = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await getApiClient().listOpenSubtasks();
      inFlight.current = false;
      dispatch({ type: "loaded", response, receivedAt: Date.now() });
    } catch {
      inFlight.current = false;
      dispatch({ type: "failed" });
    }
  }, []);

  const fetchIfPlanned = useCallback(
    (trigger: FetchTrigger) => {
      const plan = planFetch(stateRef.current, {
        trigger,
        visible: isVisible(),
        inFlight: inFlight.current,
      });
      if (plan.kind === "now") void fetchNow();
    },
    [fetchNow],
  );

  // On mount, and each time the tab is shown again or the network comes back.
  const firstRun = useRef(true);
  useEffect(() => {
    if (!visible) return;
    fetchIfPlanned(firstRun.current ? "start" : "shown");
    firstRun.current = false;
  }, [visible, fetchIfPlanned]);
  useEffect(() => {
    if (online) fetchIfPlanned("online");
  }, [online, fetchIfPlanned]);

  // After each load or failure: wait, then refresh (nothing while hidden).
  useEffect(() => {
    if (state.status === "loading") return;
    const plan = planFetch(state, { trigger: "settled", visible, inFlight: inFlight.current });
    if (plan.kind !== "after") return;
    const timer = setTimeout(() => void fetchNow(), plan.ms);
    return () => clearTimeout(timer);
  }, [state, visible, fetchNow]);

  /** Try again, after the first load failed. */
  const retry = useCallback(() => {
    dispatch({ type: "retry" });
    void fetchNow();
  }, [fetchNow]);

  return { state, online, retry };
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
