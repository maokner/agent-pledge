import { z } from "zod";

const schema = z.object({
  XRPL_NETWORK_URL: z.string().url().default("wss://s.altnet.rippletest.net:51233"),
  XRPL_EXPLORER_URL: z.string().url().default("https://testnet.xrpl.org"),
  XRPL_TOKEN_ISSUER: z.string().min(1).default("rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV"),
  XRPL_TOKEN_CURRENCY: z.string().min(1).default("524C555344000000000000000000000000000000"),
  XRPL_VAULT_SEED: z.string().optional(),
  XRPL_AGENT_SEED: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
});

export type LedgerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LedgerConfig {
  return schema.parse(env);
}
