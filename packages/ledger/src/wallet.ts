import { Wallet, type Client } from "xrpl";
import { backoffDelay, ensureConnected } from "./client.js";
import type { LedgerConfig } from "./config.js";
import { NetworkError, NotFoundError } from "./errors.js";
import { submitTx } from "./submit.js";
import type { WalletInfo } from "./types.js";

export interface FundOptions {
  /** Faucet tries before giving up. Default 4. */
  attempts?: number;
  /** XRP to ask the faucet for. Default: the faucet's default amount. */
  xrpAmount?: string;
}

export interface CreateWalletOptions extends FundOptions {
  /** Trust line limit for the token. Default "1000000". */
  trustLimit?: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** True when the account exists in the latest validated ledger. */
export async function accountExists(client: Client, address: string): Promise<boolean> {
  try {
    await client.request({ command: "account_info", account: address, ledger_index: "validated" });
    return true;
  } catch (error) {
    const data = (error as { data?: { error?: unknown } }).data;
    if (data?.error === "actNotFound") return false;
    throw error;
  }
}

/** Polls until the account exists in a validated ledger. Throws NotFoundError after `timeoutMs`. */
export async function waitForAccount(
  client: Client,
  address: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await accountExists(client, address))) {
    if (Date.now() > deadline) throw new NotFoundError(`Account ${address}`);
    await sleep(1_000);
  }
}

/**
 * Creates a wallet funded with XRP from the testnet faucet. Retries the faucet with backoff and
 * waits until the account exists in a validated ledger, so the next transaction can use it at once.
 */
export async function createFundedWallet(
  client: Client,
  options: FundOptions = {},
): Promise<Wallet> {
  const attempts = options.attempts ?? 4;
  // One wallet for all tries: a try that funded the account but timed out is not wasted.
  const wallet = Wallet.generate();
  for (let attempt = 0; ; attempt++) {
    try {
      await ensureConnected(client);
      await client.fundWallet(wallet, options.xrpAmount ? { amount: options.xrpAmount } : {});
      break;
    } catch (error) {
      if (await accountExists(client, wallet.classicAddress).catch(() => false)) break;
      if (attempt + 1 >= attempts) {
        throw new NetworkError(
          `Testnet faucet failed after ${attempts} tries: ${String(error)}`,
          error,
        );
      }
      await sleep(1_000 + backoffDelay(attempt + 1));
    }
  }
  await waitForAccount(client, wallet.classicAddress);
  return wallet;
}

/**
 * Sets a trust line from the wallet to the configured token issuer. Does nothing when a trust line
 * with at least this limit already exists.
 */
export async function ensureTrustLine(
  client: Client,
  wallet: Wallet,
  config: LedgerConfig,
  limit = "1000000",
): Promise<void> {
  const lines = await client.request({
    command: "account_lines",
    account: wallet.classicAddress,
    peer: config.XRPL_TOKEN_ISSUER,
    ledger_index: "validated",
  });
  const existing = lines.result.lines.find((line) => line.currency === config.XRPL_TOKEN_CURRENCY);
  if (existing && Number(existing.limit) >= Number(limit)) return;
  await submitTx(
    client,
    wallet,
    {
      TransactionType: "TrustSet",
      Account: wallet.classicAddress,
      LimitAmount: {
        currency: config.XRPL_TOKEN_CURRENCY,
        issuer: config.XRPL_TOKEN_ISSUER,
        value: limit,
      },
    },
    { config },
  );
}

/** Faucet-funded wallet with a token trust line. Used for requesters and helpers (PRD 5.1). */
export async function createWallet(
  client: Client,
  config: LedgerConfig,
  options: CreateWalletOptions = {},
): Promise<WalletInfo> {
  const wallet = await createFundedWallet(client, options);
  await ensureTrustLine(client, wallet, config, options.trustLimit);
  return { address: wallet.classicAddress, seed: wallet.seed! };
}

export function walletFromSeed(seed: string): Wallet {
  return Wallet.fromSeed(seed);
}
