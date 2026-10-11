import type { Client, IssuedCurrencyAmount } from "xrpl";
import type { LedgerConfig } from "./config.js";

/**
 * Builds an amount of the configured token (RLUSD, or the self-issued fallback).
 *
 * @example
 * tokenAmount(config, 5) // { currency: "524C...", issuer: "rQhW...", value: "5" }
 */
export function tokenAmount(config: LedgerConfig, value: string | number): IssuedCurrencyAmount {
  const text = typeof value === "number" ? String(value) : value;
  if (!/^\d+(\.\d+)?$/.test(text)) throw new RangeError(`Invalid token amount: ${text}`);
  return { currency: config.XRPL_TOKEN_CURRENCY, issuer: config.XRPL_TOKEN_ISSUER, value: text };
}

/** The account's balance of the configured token in the validated ledger, as a decimal string. "0" when it has no trust line. */
export async function getTokenBalance(
  client: Client,
  address: string,
  config: LedgerConfig,
): Promise<string> {
  const lines = await client.request({
    command: "account_lines",
    account: address,
    peer: config.XRPL_TOKEN_ISSUER,
    ledger_index: "validated",
  });
  const line = lines.result.lines.find((l) => l.currency === config.XRPL_TOKEN_CURRENCY);
  return line?.balance ?? "0";
}
