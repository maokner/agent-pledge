import { isValidClassicAddress, isValidSecret } from "xrpl";
import { z } from "zod";
import { ConfigError } from "./errors.js";

/** RLUSD on XRPL testnet (PRD 5.1). */
export const RLUSD_TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
/** "RLUSD" as a 160-bit hex currency code. */
export const RLUSD_CURRENCY = "524C555344000000000000000000000000000000";

/**
 * A currency code is either a 3-character standard code (not "XRP") or 40 hex characters.
 * See https://xrpl.org/docs/references/protocol/data-types/currency-formats#currency-codes
 */
export function isValidCurrencyCode(code: string): boolean {
  if (/^[0-9A-Fa-f]{40}$/.test(code)) return !/^00/.test(code);
  return /^[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}$/.test(code) && code.toUpperCase() !== "XRP";
}

/** Treats empty strings (for example `XRPL_VAULT_SEED=` in a .env file) as unset. */
const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const optional = <T extends z.ZodType>(type: T) => z.preprocess(emptyAsUndefined, type.optional());
const withDefault = (type: z.ZodType<string>, fallback: string) =>
  z.preprocess(emptyAsUndefined, type.default(fallback));

const address = z.string().refine(isValidClassicAddress, "must be a classic XRPL address (r...)");
const seed = z.string().refine(isValidSecret, "must be a valid XRPL seed (s...)");
const currency = z
  .string()
  .refine(isValidCurrencyCode, "must be a 3-character code or 40 hex characters");

const schema = z.object({
  XRPL_NETWORK_URL: withDefault(z.string().url(), "wss://s.altnet.rippletest.net:51233"),
  XRPL_EXPLORER_URL: withDefault(z.string().url(), "https://testnet.xrpl.org"),
  XRPL_TOKEN_ISSUER: withDefault(address, RLUSD_TESTNET_ISSUER),
  XRPL_TOKEN_CURRENCY: withDefault(currency, RLUSD_CURRENCY),
  XRPL_VAULT_SEED: optional(seed),
  XRPL_AGENT_SEED: optional(seed),
  /** Seed of the demo requester wallet made by `pnpm --filter @agent-pledge/ledger setup`. */
  XRPL_REQUESTER_SEED: optional(seed),
  /** Seed of a self-issued fallback token issuer. Only the setup script uses it. */
  XRPL_TOKEN_ISSUER_SEED: optional(seed),
  PUBLIC_BASE_URL: withDefault(z.string().url(), "http://localhost:3000"),
});

export type LedgerConfig = z.infer<typeof schema>;

/**
 * Parses ledger settings from environment variables. Unknown variables are ignored.
 * Throws a ConfigError that names every invalid variable. Its `cause` is the ZodError.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): LedgerConfig {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
  throw new ConfigError(`Invalid ledger config: ${problems.join("; ")}`, parsed.error);
}
