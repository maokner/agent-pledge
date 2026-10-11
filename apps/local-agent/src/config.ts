import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where the local agent keeps its files unless AGENT_STATE_DIR says otherwise: apps/local-agent/.data */
export const DEFAULT_STATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
);

export type LedgerMode = "fake" | "xrpl";
export type AgentMode = "llm" | "scripted";
export type DriverName = "playwright" | "render" | "computer-use";

export interface YikYakConfig {
  driver: DriverName;
  /** Minimum gap between two real posts, in ms (default 10 minutes, PRD 8 / R6). */
  minIntervalMs: number;
  url: string;
  /** Optional button that opens the composer. Empty = the text box is already on the page. */
  composeSelector: string;
  textSelector: string;
  submitSelector: string;
  /** Persistent Chromium profile so our logged-in Yik Yak session is reused. */
  profileDir: string;
  /** "chrome" to drive the installed Google Chrome instead of Playwright's Chromium. */
  browserChannel: string;
  /** How long to wait after clicking submit before the screenshot. */
  postWaitMs: number;
}

export interface AgentConfig {
  serverUrl: string;
  wsUrl: string;
  agentToken: string;
  /** The agent's XRPL seed. Stays on the laptop; only used in xrpl mode. */
  agentSeed: string;
  ledgerMode: LedgerMode;
  xrplNetworkUrl: string;
  vaultAddress: string;
  rlusdIssuer: string;
  rlusdCurrency: string;
  xrplExplorerUrl: string;
  anthropicApiKey: string;
  model: string;
  agentMode: AgentMode;
  stateDir: string;
  yikyak: YikYakConfig;
}

type Env = Record<string, string | undefined>;

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`invalid value "${value}"; expected one of ${allowed.join(", ")}`);
}

function wsFromHttp(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws/agent";
  return u.toString();
}

export function loadConfig(rawEnv: Env = process.env): AgentConfig {
  // An empty value in .env (e.g. `AGENT_STATE_DIR=`) means "use the default".
  const env: Env = Object.fromEntries(
    Object.entries(rawEnv).filter(([, v]) => v !== undefined && v.trim() !== ""),
  );
  const serverUrl = (env.SERVER_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  const anthropicApiKey = env.ANTHROPIC_API_KEY ?? "";
  const stateDir = path.resolve(env.AGENT_STATE_DIR ?? DEFAULT_STATE_DIR);
  return {
    serverUrl,
    wsUrl: env.SERVER_WS_URL ?? wsFromHttp(serverUrl),
    agentToken: env.AGENT_TOKEN ?? "",
    agentSeed: env.AGENT_SEED ?? "",
    ledgerMode: pick(env.LEDGER_MODE, ["fake", "xrpl"] as const, "fake"),
    xrplNetworkUrl: env.XRPL_NETWORK_URL ?? "wss://s.altnet.rippletest.net:51233",
    vaultAddress: env.VAULT_ADDRESS ?? "",
    rlusdIssuer: env.RLUSD_ISSUER ?? "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV",
    rlusdCurrency: env.RLUSD_CURRENCY ?? "524C555344000000000000000000000000000000",
    xrplExplorerUrl: env.XRPL_EXPLORER_URL ?? "https://testnet.xrpl.org",
    anthropicApiKey,
    model: env.AGENT_MODEL ?? "claude-haiku-5-5",
    agentMode: pick(
      env.AGENT_MODE,
      ["llm", "scripted"] as const,
      anthropicApiKey ? "llm" : "scripted",
    ),
    stateDir,
    yikyak: {
      driver: pick(env.YIKYAK_DRIVER, ["playwright", "render", "computer-use"] as const, "render"),
      minIntervalMs: Number(env.YIKYAK_MIN_INTERVAL_SECONDS ?? 600) * 1000,
      url: env.YIKYAK_URL ?? "https://yikyak.com",
      composeSelector: env.YIKYAK_COMPOSE_SELECTOR ?? "",
      textSelector: env.YIKYAK_TEXT_SELECTOR ?? "textarea",
      submitSelector: env.YIKYAK_SUBMIT_SELECTOR ?? 'button[type="submit"]',
      profileDir: path.resolve(env.YIKYAK_PROFILE_DIR ?? path.join(stateDir, "chrome-profile")),
      browserChannel: env.YIKYAK_BROWSER_CHANNEL ?? "",
      postWaitMs: Number(env.YIKYAK_POST_WAIT_MS ?? 3000),
    },
  };
}
