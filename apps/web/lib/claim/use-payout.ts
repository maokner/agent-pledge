"use client";

import type { ClaimView } from "@/lib/contract";
import { useEffect, useRef } from "react";
import { getApiClient } from "../api";
import { payUntilPaid } from "./payout";

/**
 * While `enabled` (see needsPayCall), asks the server to pay this phone for
 * the photo it sent, retrying passing failures. useClaim keeps reloading the
 * claim at the same time, so whichever sees the payout first moves the page on;
 * then `enabled` turns false and this stops.
 */
export function usePayout({
  code,
  enabled,
  onUpdate,
  refresh,
}: {
  code: string;
  enabled: boolean;
  onUpdate: (view: ClaimView) => void;
  refresh: () => Promise<ClaimView | null>;
}) {
  const callbacks = useRef({ onUpdate, refresh });
  useEffect(() => {
    callbacks.current = { onUpdate, refresh };
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void payUntilPaid({
      pay: () => getApiClient().pay(code),
      onPaid: (view) => callbacks.current.onUpdate(view),
      onStop: () => void callbacks.current.refresh(),
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [code, enabled]);
}
