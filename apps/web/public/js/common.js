// Helpers shared by the board and the claim page. Plain ES module, no build step.

/** "5.00" -> 500. Returns 0 for null or bad input. */
export function toCents(money) {
  if (money == null) return 0;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(money).trim().replace(/^\$/, ""));
  if (!m) return 0;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** 500 -> "$5.00". Negative values get a leading minus. */
export function usd(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "5.00" -> "$5.00". */
export const money = (m) => usd(toCents(m));

/** Signed amount for results: +$1.00, -$1.00, $0.00. */
export const signedUsd = (cents) => (cents > 0 ? `+${usd(cents)}` : usd(cents));

/** Milliseconds left until an ISO deadline (negative when passed). */
export const msLeft = (iso, now = Date.now()) => new Date(iso).getTime() - now;

/** 125000 -> "2:05". 3723000 -> "1:02:03". Passed -> "0:00". */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Escapes text for use in innerHTML templates. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "rUEpnDKWQTpX7YU82Mo8ZiigDEARHJYS9p" -> "rUEp...HJYS9p". */
export const shortAddr = (a) =>
  a && a.length > 12 ? `${a.slice(0, 4)}...${a.slice(-6)}` : a || "";

/** "14:03:07" in local time. */
export function clockTime(iso) {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/**
 * Media URLs in the views are absolute (PUBLIC_API_URL). The pages share the server's origin, so
 * use a relative URL: it keeps working when the tunnel URL differs from PUBLIC_API_URL.
 */
export const mediaSrc = (media) => (media ? media.local_src || `/media/${media.id}` : "");
