/**
 * The claim page counts down with the server's clock, because a stranger's
 * phone clock can be off by minutes (ClaimView.server_time). The real server
 * sends no clock yet, so lib/backend fills server_time with the phone's own and
 * the offset is 0 until it does.
 */
import type { IsoDateTime } from "@agent-pledge/shared";

/** Server clock minus phone clock, measured when a ClaimView arrived. */
export function clockOffsetMs(serverTime: IsoDateTime, receivedAt: number): number {
  const server = Date.parse(serverTime);
  return Number.isNaN(server) ? 0 : server - receivedAt;
}

/** "3:00", "0:07", "1:05:09". Rounds up, so "0:00" shows only when the time is really up. */
export function formatMsLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Milliseconds until the deadline on the server's clock, never below zero. */
export function msLeft(deadline: IsoDateTime, phoneNow: number, offsetMs: number): number {
  return Math.max(0, Date.parse(deadline) - (phoneNow + offsetMs));
}
