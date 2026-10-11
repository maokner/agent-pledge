import type { LedgerConfig } from "./config.js";

export function explorerTxUrl(config: LedgerConfig, hash: string): string {
  return `${config.XRPL_EXPLORER_URL}/transactions/${hash}`;
}

export function explorerAccountUrl(config: LedgerConfig, address: string): string {
  return `${config.XRPL_EXPLORER_URL}/accounts/${address}`;
}

export function explorerNftUrl(config: LedgerConfig, nftId: string): string {
  return `${config.XRPL_EXPLORER_URL}/nft/${nftId}`;
}
