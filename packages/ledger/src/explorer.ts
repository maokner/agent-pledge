import { loadConfig, type LedgerConfig } from "./config.js";

/** Explorer routes, checked against the ripple/explorer source (src/containers/App/routes.ts) and live testnet.xrpl.org. */
function base(config: LedgerConfig): string {
  return config.XRPL_EXPLORER_URL.replace(/\/+$/, "");
}

/** `https://testnet.xrpl.org/transactions/<hash>` */
export function explorerTxUrl(config: LedgerConfig, hash: string): string {
  return `${base(config)}/transactions/${hash}`;
}

/** `https://testnet.xrpl.org/accounts/<address>` */
export function explorerAccountUrl(config: LedgerConfig, address: string): string {
  return `${base(config)}/accounts/${address}`;
}

/** `https://testnet.xrpl.org/nft/<nftId>` */
export function explorerNftUrl(config: LedgerConfig, nftId: string): string {
  return `${base(config)}/nft/${nftId}`;
}

export type ExplorerTarget = { tx: string } | { account: string } | { nft: string };

/**
 * One helper for every explorer link. A transaction hash and an NFT ID are both 64 hex characters,
 * so the caller names which one it has.
 *
 * @example
 * explorerUrl({ tx: hash }); explorerUrl({ nft: nftId }); explorerUrl({ account: address });
 */
export function explorerUrl(target: ExplorerTarget, config: LedgerConfig = loadConfig()): string {
  if ("tx" in target) return explorerTxUrl(config, target.tx);
  if ("nft" in target) return explorerNftUrl(config, target.nft);
  return explorerAccountUrl(config, target.account);
}
