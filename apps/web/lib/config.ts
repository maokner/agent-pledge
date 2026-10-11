/**
 * Runtime configuration from NEXT_PUBLIC_* env vars (inlined at build time).
 * See apps/web/.env.example.
 */

/** NEXT_PUBLIC_FIXTURES=1 serves fixture data and a simulated live event stream; no server needed. */
export const FIXTURE_MODE = process.env.NEXT_PUBLIC_FIXTURES === "1";

/** The server's port when it runs locally (its PORT default). */
export const LOCAL_API_URL = "http://localhost:3001";

/**
 * Base URL of the server's HTTP API: NEXT_PUBLIC_API_URL, or the server's
 * local default outside fixture mode. Set it to "" for same origin (server and
 * board behind one host).
 */
export function apiUrlFrom(env: { NEXT_PUBLIC_API_URL?: string; NEXT_PUBLIC_FIXTURES?: string }): string {
  return trimSlash(env.NEXT_PUBLIC_API_URL ?? (env.NEXT_PUBLIC_FIXTURES === "1" ? "" : LOCAL_API_URL));
}

// Spelled out, so Next.js inlines them at build time.
export const API_URL = apiUrlFrom({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_FIXTURES: process.env.NEXT_PUBLIC_FIXTURES,
});

/**
 * Base URL of the server's WebSocket endpoint. Defaults to API_URL with
 * http(s) swapped for ws(s), or the page's own origin.
 */
export function wsBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return trimSlash(explicit);
  const http = API_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return http.replace(/^http/, "ws");
}

/** XRPL explorer base. Defaults to the testnet explorer, since the demo runs on XRPL Testnet (PRD 5.1). */
export const EXPLORER_URL = trimSlash(
  process.env.NEXT_PUBLIC_XRPL_EXPLORER_URL ?? "https://testnet.xrpl.org",
);

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
