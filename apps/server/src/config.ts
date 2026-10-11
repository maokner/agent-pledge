import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Money } from "@agent-pledge/shared";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/** apps/server, regardless of the current working directory. */
export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEV_SECRET = "dev-only-change-me-0123456789abcdef";

const splitCsv = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().default(3001),
  HOST: z.string().default("0.0.0.0"),
  /** Where the board and claim page live (apps/web). Claim links: `${PUBLIC_BASE_URL}/c/<CODE>`. */
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  /** Public URL of this server. NFT URIs and media URLs use it. */
  PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
  /**
   * postgres://... -> node-postgres. pglite://<dir> -> PGlite on disk (relative to apps/server).
   * memory:// -> in-memory PGlite (tests).
   */
  DATABASE_URL: z.string().default("pglite://.data/pglite"),
  LEDGER_MODE: z.enum(["fake", "xrpl"]).default("fake"),
  VOICE_SHARED_SECRET: z.string().min(8).default(DEV_SECRET),
  AGENT_TOKEN: z.string().min(8).default(DEV_SECRET),
  COOKIE_SECRET: z.string().min(32).default(DEV_SECRET),
  /** Any string; a 32-byte AES-256-GCM key is derived from it with SHA-256. */
  SEED_ENCRYPTION_KEY: z.string().min(16).default(DEV_SECRET),
  /** Comma-separated origins allowed by CORS (with credentials). */
  CORS_ORIGINS: z.string().default("http://localhost:3000").transform(splitCsv),
  /** The local agent's XRPL address. In fake mode, defaults to the fake ledger's agent account. */
  AGENT_ADDRESS: z.string().optional(),
  PLEDGE_AMOUNT: Money.default("1.00"),
  /** Treasury -> new requester wallet. Empty = exactly the task price. */
  REQUESTER_FUNDING_AMOUNT: z.union([Money, z.literal("")]).default(""),
  FAKE_LEDGER_LATENCY_MS: z.coerce.number().int().min(0).default(300),
  /** Fake ledger: RLUSD the agent account starts with. */
  FAKE_AGENT_BALANCE: Money.default("100.00"),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .default(8 * 1024 * 1024),
  // XRPL (LEDGER_MODE=xrpl) — passed to packages/ledger.
  XRPL_NETWORK_URL: z.string().default("wss://s.altnet.rippletest.net:51233"),
  XRPL_EXPLORER_URL: z.string().default("https://testnet.xrpl.org"),
  VAULT_SEED: z.string().optional(),
  TREASURY_SEED: z.string().optional(),
  RLUSD_ISSUER: z.string().default("rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV"),
  RLUSD_CURRENCY: z.string().default("524C555344000000000000000000000000000000"),
});

export type Config = z.infer<typeof ConfigSchema>;

const SECRET_KEYS = [
  "VOICE_SHARED_SECRET",
  "AGENT_TOKEN",
  "COOKIE_SECRET",
  "SEED_ENCRYPTION_KEY",
] as const;

/** Parses env vars. Throws with a readable message on invalid config. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  const cfg = result.data;
  if (cfg.NODE_ENV === "production") {
    const weak = SECRET_KEYS.filter((k) => cfg[k] === DEV_SECRET);
    if (weak.length) throw new Error(`Set these secrets in production: ${weak.join(", ")}`);
  }
  if (cfg.LEDGER_MODE === "xrpl" && (!cfg.VAULT_SEED || !cfg.AGENT_ADDRESS)) {
    throw new Error("LEDGER_MODE=xrpl needs VAULT_SEED and AGENT_ADDRESS");
  }
  return cfg;
}

/** Loads apps/server/.env (if present), then the repo-root .env, then parses process.env. */
export function loadConfig(): Config {
  for (const p of [resolve(SERVER_ROOT, ".env"), resolve(SERVER_ROOT, "../../.env")]) {
    if (existsSync(p)) loadDotenv({ path: p, quiet: true });
  }
  return parseConfig(process.env);
}

/** Config for tests: fixed secrets, in-memory DB, fake ledger with no latency. */
export function testConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  return parseConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: "memory://",
    LEDGER_MODE: "fake",
    FAKE_LEDGER_LATENCY_MS: "0",
    VOICE_SHARED_SECRET: "test-voice-secret",
    AGENT_TOKEN: "test-agent-token",
    COOKIE_SECRET: "test-cookie-secret-0123456789abcdef",
    SEED_ENCRYPTION_KEY: "test-seed-key-0123456789",
    PUBLIC_BASE_URL: "http://board.test",
    PUBLIC_API_URL: "http://api.test",
    ...overrides,
  });
}
