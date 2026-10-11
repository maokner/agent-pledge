import { Wallet, type Client } from "xrpl";
import type { LedgerConfig } from "./config.js";
import { submitTx } from "./submit.js";
import type { WalletInfo } from "./types.js";

/** Creates a wallet funded with XRP from the testnet faucet. */
export async function createFundedWallet(client: Client): Promise<Wallet> {
  const { wallet } = await client.fundWallet();
  return wallet;
}

/** Sets a trust line from the wallet to the configured token issuer. */
export async function ensureTrustLine(
  client: Client,
  wallet: Wallet,
  config: LedgerConfig,
  limit = "1000000",
): Promise<void> {
  await submitTx(client, wallet, {
    TransactionType: "TrustSet",
    Account: wallet.classicAddress,
    LimitAmount: {
      currency: config.XRPL_TOKEN_CURRENCY,
      issuer: config.XRPL_TOKEN_ISSUER,
      value: limit,
    },
  });
}

/** Faucet-funded wallet with a token trust line. Used for requesters and helpers (PRD 5.1). */
export async function createWallet(client: Client, config: LedgerConfig): Promise<WalletInfo> {
  const wallet = await createFundedWallet(client);
  await ensureTrustLine(client, wallet, config);
  return { address: wallet.classicAddress, seed: wallet.seed! };
}

export function walletFromSeed(seed: string): Wallet {
  return Wallet.fromSeed(seed);
}
