/**
 * Test fixtures for the testnet demo.
 * Testnet RLUSD cannot be obtained by a script, so this makes a self-issued stand-in token
 * (PRD 11, first risk): a faucet-funded issuer with asfDefaultRipple, a trust line from every wallet,
 * and 100 units issued to the requester and the local agent.
 */
import { AccountSetAsfFlags, type Client, type Wallet } from "xrpl";
import {
  createFundedWallet,
  ensureTrustLine,
  getClient,
  loadConfig,
  submitTx,
  tokenAmount,
  type LedgerConfig,
} from "../src/index.js";

/** "TSTUSD" as a 160-bit currency code, the same form as RLUSD's code. */
export const FIXTURE_CURRENCY = Buffer.from("TSTUSD", "ascii")
  .toString("hex")
  .toUpperCase()
  .padEnd(40, "0");

export const FIXTURE_ISSUED_AMOUNT = "100";

export interface DemoWallets {
  issuer: Wallet;
  vault: Wallet;
  requester: Wallet;
  agent: Wallet;
  helpers: Wallet[];
}

export interface Fixtures {
  client: Client;
  /** Config with XRPL_TOKEN_ISSUER and XRPL_TOKEN_CURRENCY set to the fixture token. */
  config: LedgerConfig;
  wallets: DemoWallets;
}

export type Log = (line: string) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Faucet funding with retries. The testnet faucet rate-limits and sometimes times out. */
async function fundWithRetry(
  client: Client,
  role: string,
  log: Log,
  attempts = 6,
): Promise<Wallet> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await createFundedWallet(client);
    } catch (error) {
      if (attempt >= attempts) throw error;
      const wait = 5_000 * attempt;
      log(`  faucet failed for ${role} (${(error as Error).message}). Retry in ${wait / 1000}s.`);
      await sleep(wait);
    }
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function createFixtures(options: {
  helperCount: number;
  log: Log;
}): Promise<Fixtures> {
  const { log } = options;
  const base = loadConfig();
  const client = await getClient(base);

  const roles = ["issuer", "vault", "requester", "agent"];
  for (let i = 1; i <= options.helperCount; i++) roles.push(`helper${i}`);
  let started = Date.now();
  const funded = await mapLimit(roles, 3, (role) => fundWithRetry(client, role, log));
  const [issuer, vault, requester, agent, ...helpers] = funded as [
    Wallet,
    Wallet,
    Wallet,
    Wallet,
    ...Wallet[],
  ];
  log(`  funded ${roles.length} wallets from the faucet in ${seconds(started)}`);

  // DefaultRipple must be on before the trust lines exist, so that the issuer side of each
  // line allows rippling. Without it, requester to vault payments of the token fail.
  started = Date.now();
  await submitTx(client, issuer, {
    TransactionType: "AccountSet",
    Account: issuer.classicAddress,
    SetFlag: AccountSetAsfFlags.asfDefaultRipple,
  });
  log(`  issuer asfDefaultRipple set in ${seconds(started)}`);

  const config = loadConfig({
    ...process.env,
    XRPL_TOKEN_ISSUER: issuer.classicAddress,
    XRPL_TOKEN_CURRENCY: FIXTURE_CURRENCY,
  });

  // Different wallets, so the trust lines can go in parallel.
  started = Date.now();
  await Promise.all(
    [vault, requester, agent, ...helpers].map((w) => ensureTrustLine(client, w, config)),
  );
  log(`  ${3 + helpers.length} trust lines set in parallel in ${seconds(started)}`);

  // Same wallet (the issuer), so one after another.
  started = Date.now();
  for (const holder of [requester, agent]) {
    await submitTx(client, issuer, {
      TransactionType: "Payment",
      Account: issuer.classicAddress,
      Destination: holder.classicAddress,
      Amount: tokenAmount(config, FIXTURE_ISSUED_AMOUNT),
    });
  }
  log(
    `  issued ${FIXTURE_ISSUED_AMOUNT} TSTUSD to the requester and the agent in ${seconds(started)}`,
  );

  return { client, config, wallets: { issuer, vault, requester, agent, helpers } };
}

export function seconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}
