/**
 * The real server's claim page shapes mapped into the web app's ClaimView,
 * plus where the claim page keeps the server's helper token.
 */
import type { ClaimState, ClaimView } from "@/lib/contract";
import { photoFrom } from "./board";
import type { BackendClaimView } from "./types";

export interface ClaimViewOptions {
  /** Epoch ms when the view arrived. The server sends no clock, so this stands in for server_time. */
  now: number;
  /** The sub-task's time limit, which the claim view does not carry. Null: use the minutes left. */
  timeLimitMinutes?: number | null;
}

export function claimViewFromBackend(view: BackendClaimView, { now, timeLimitMinutes = null }: ClaimViewOptions): ClaimView {
  const minutesLeft = Math.max(1, Math.ceil((Date.parse(view.deadline) - now) / 60_000) || 1);
  return {
    code: view.code,
    state: claimStateOf(view),
    subtask: {
      description: view.description,
      place: view.place,
      time_limit_minutes: timeLimitMinutes ?? minutesLeft,
      deadline_at: view.deadline,
      price: view.price,
    },
    // The server sends the photo to anyone who asks (open question 3); only the phone that claimed sees it here.
    photo: view.claimed_by_you ? photoFrom(view.photo, view.helper_note) : null,
    pin_attempts_left: view.pin.attempts_left,
    payout: view.payout && { ...view.payout, status: "validated" },
    // No server_time from the server yet: the phone's clock, so the countdown offset is zero.
    server_time: new Date(now).toISOString(),
  };
}

/** The page's state, from the server's status, claimed_by_you, PIN state and payout. */
export function claimStateOf(view: Pick<BackendClaimView, "status" | "claimed_by_you" | "pin" | "payout">): ClaimState {
  if (view.status === "failed") return "expired";
  if (view.status === "open") return "open";
  if (!view.claimed_by_you) return "already_claimed";
  if (view.payout) return "paid";
  // The server answers the right PIN only after the payout lands, so another tab can see this in between.
  if (view.pin.verified || view.status === "done") return "paying";
  if (view.pin.locked) return "locked";
  return "claimed_by_you";
}

/**
 * The helper token from `POST /claim/:code/claim`, one per claim code, in
 * localStorage. The claim page and the server are on different origins, so the
 * client sends it back as `x-helper-token` instead of relying on the cookie.
 * Never throws: without storage (private mode, blocked site data) it just forgets.
 */
export interface HelperTokenStore {
  get(code: string): string | null;
  set(code: string, token: string): void;
}

export function createHelperTokenStore(storage: () => Storage | null = browserStorage): HelperTokenStore {
  const key = (code: string) => `agent-pledge:helper-token:${code.trim().toUpperCase()}`;
  return {
    get(code) {
      try {
        return storage()?.getItem(key(code)) ?? null;
      } catch {
        return null;
      }
    },
    set(code, token) {
      try {
        storage()?.setItem(key(code), token);
      } catch {
        // Storage is full or blocked: this phone keeps the claim only while the page is open (and via the cookie).
      }
    },
  };
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
