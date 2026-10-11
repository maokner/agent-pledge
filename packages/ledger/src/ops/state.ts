import type { Client, Memo } from "xrpl";
import type { LedgerConfig } from "../config.js";
import { readMemos, type MemoFields } from "../memo.js";
import { getAcceptedNftId } from "./meta.js";

/** One validated transaction from account_tx, reduced to the fields the ops read. */
export interface LedgerTxRecord {
  hash: string;
  type: string;
  account: string;
  destination?: string | undefined;
  result: string;
  /** NFTokenID from the tx fields, or for NFTokenAcceptOffer, from the deleted offer in the meta. */
  nftId?: string | undefined;
  memos: MemoFields;
}

interface RawAccountTxEntry {
  hash?: string;
  tx_json?: Record<string, unknown>;
  tx?: Record<string, unknown>;
  meta?: unknown;
  validated?: boolean;
}

export function toLedgerTxRecord(entry: RawAccountTxEntry): LedgerTxRecord | undefined {
  const tx = entry.tx_json ?? entry.tx;
  if (!tx || entry.validated === false) return undefined;
  const meta = entry.meta as { TransactionResult?: unknown } | undefined;
  const hash = entry.hash ?? (typeof tx.hash === "string" ? tx.hash : undefined);
  if (!hash) return undefined;
  return {
    hash,
    type: String(tx.TransactionType),
    account: String(tx.Account),
    destination: typeof tx.Destination === "string" ? tx.Destination : undefined,
    result: typeof meta?.TransactionResult === "string" ? meta.TransactionResult : "unknown",
    nftId:
      typeof tx.NFTokenID === "string"
        ? tx.NFTokenID
        : tx.TransactionType === "NFTokenAcceptOffer" && meta && typeof meta === "object"
          ? getAcceptedNftId(meta as never)
          : undefined,
    memos: readMemos(tx.Memos as Memo[] | undefined),
  };
}

export interface AccountHistoryOptions {
  /** Oldest ledger to scan. Pass the ledger of the task's first transaction to keep scans short. */
  ledgerIndexMin?: number | undefined;
  pageSize?: number | undefined;
}

/**
 * Every validated transaction that affected the account, newest first.
 * The vault's history includes every burn of its NFTs, even by another holder, because each burn
 * changes the issuer's BurnedNFTokens counter.
 */
export async function listAccountTransactions(
  client: Client,
  address: string,
  options: AccountHistoryOptions = {},
): Promise<LedgerTxRecord[]> {
  const records: LedgerTxRecord[] = [];
  let marker: unknown;
  do {
    const response = await client.request({
      command: "account_tx",
      account: address,
      ledger_index_min: options.ledgerIndexMin ?? -1,
      ledger_index_max: -1,
      limit: options.pageSize ?? 200,
      ...(marker === undefined ? {} : { marker }),
    });
    for (const entry of response.result.transactions as RawAccountTxEntry[]) {
      const record = toLedgerTxRecord(entry);
      if (record) records.push(record);
    }
    marker = response.result.marker;
  } while (marker !== undefined);
  return records;
}

function isNotFound(error: unknown): boolean {
  const code = (error as { data?: { error?: unknown } } | undefined)?.data?.error;
  return code === "actNotFound";
}

/** True if the account holds the NFT now. */
export async function accountHoldsNft(
  client: Client,
  address: string,
  nftId: string,
): Promise<boolean> {
  let marker: unknown;
  do {
    let response;
    try {
      response = await client.request({
        command: "account_nfts",
        account: address,
        ledger_index: "validated",
        limit: 400,
        ...(marker === undefined ? {} : { marker }),
      });
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
    if (response.result.account_nfts.some((nft) => nft.NFTokenID === nftId)) return true;
    marker = response.result.marker;
  } while (marker !== undefined);
  return false;
}

/**
 * Finds which of the candidate accounts holds the NFT. Returns undefined if none of them does.
 * rippled has no nft_info (Clio only), so the caller names the possible holders.
 */
export async function findNftHolder(
  client: Client,
  nftId: string,
  candidates: readonly string[],
): Promise<string | undefined> {
  for (const address of new Set(candidates)) {
    if (await accountHoldsNft(client, address, nftId)) return address;
  }
  return undefined;
}

/** The account's balance of the configured token, as the decimal string the ledger returns. */
export async function getTokenBalance(
  client: Client,
  config: LedgerConfig,
  address: string,
): Promise<string> {
  if (address === config.XRPL_TOKEN_ISSUER) return "0";
  let marker: unknown;
  do {
    const response = await client.request({
      command: "account_lines",
      account: address,
      peer: config.XRPL_TOKEN_ISSUER,
      ledger_index: "validated",
      ...(marker === undefined ? {} : { marker }),
    });
    const line = response.result.lines.find((l) => l.currency === config.XRPL_TOKEN_CURRENCY);
    if (line) return line.balance;
    marker = response.result.marker;
  } while (marker !== undefined);
  return "0";
}
