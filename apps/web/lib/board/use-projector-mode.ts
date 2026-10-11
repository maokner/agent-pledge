"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { PROJECTOR_STORAGE_KEY, projectorModeFrom } from "./projector";

const CHANGE_EVENT = "agent-pledge:projector-change";

/**
 * Projector mode (#43): on from `?projector=1` or the toggle, remembered in
 * localStorage. While on, `<html>` carries `data-projector`, which switches
 * on the `projector:` Tailwind variant, scales the page to the screen and
 * forces the light color scheme (see app/globals.css).
 *
 *   const [projector, setProjector] = useProjectorMode();
 */
export function useProjectorMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readMode, () => false);

  useEffect(() => {
    // Remember what the URL asked for, so a reload without the query keeps it.
    const { remember } = projectorModeFrom(window.location.search, readStored());
    if (remember) writeStored(remember);
  }, []);

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.dataset.projector = "";
    return () => {
      delete root.dataset.projector;
    };
  }, [on]);

  const setOn = useCallback((next: boolean) => {
    writeStored(next ? "1" : "0");
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("projector", "1");
    else url.searchParams.delete("projector");
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [on, setOn];
}

function readMode(): boolean {
  return projectorModeFrom(window.location.search, readStored()).on;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function readStored(): string | null {
  try {
    return localStorage.getItem(PROJECTOR_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: "1" | "0"): void {
  try {
    localStorage.setItem(PROJECTOR_STORAGE_KEY, value);
  } catch {
    // Storage blocked: the query parameter still works for this page load.
  }
}
