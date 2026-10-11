import type { Amount, Client } from "xrpl";
import type { LedgerConfig } from "../config.js";
import { LedgerError } from "../errors.js";
import { readMemos, type MemoFields } from "../memo.js";
import { normalizeLedgerValue } from "./amount.js";
import { getAcceptedNftId, getCreatedOfferId, getMintedNftId } from "./meta.js";

/** One validated transaction from account_tx, reduced to the fields the ops read. */
export interface LedgerTxRecord {
  hash: string;
  type: string;
  account: string;
  destination?: string | undefined;
  result: string;
  /**
   * The NFT: NFTokenID from the tx fields, or from the meta for NFTokenMint (the new NFT) and
   * NFTokenAcceptOffer (the NFT that moved).
   */
  nftId?: string | undefined;
  /**
   * Payment: the amount that arrived (`meta.delivered_amount`), so a partial payment counts only
   * what it delivered. NFTokenCreateOffer, or NFTokenMint with an offer: the offer `Amount`.
   */
  amount?: Amount | undefined;
  /**
   * NFTokenCreateOffer, or NFTokenMint with an offer: the offer it made.
   * NFTokenAcceptOffer: the sell offer it accepted.
   */
  offerId?: string | undefined;
  /** The account whose AccountRoot this transaction created, for example the faucet payment. */
  createdAccount?: string | undefined;
  memos: MemoFields;
}

interface RawAccountTxEntry {
  hash?: string;
  tx_json?: Record<string, unknown>;
  tx?: Record<string, unknown>;
  meta?: unknown;
  validated?: boolean;
}

function asAmount(value: unknown): Amount | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const { currency, issuer, value: v } = value as Record<string, unknown>;
    if (typeof currency === "string" && typeof issuer === "string" && typeof v === "string") {
      return { currency, issuer, value: v };
    }
  }
  return undefined;
}

function createdAccountOf(meta: Record<string, unknown> | undefined): string | undefined {
  const nodes = meta?.AffectedNodes;
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes as Array<{ CreatedNode?: Record<string, unknown> }>) {
    const created = node.CreatedNode;
    if (created?.LedgerEntryType !== "AccountRoot") continue;
    const account = (created.NewFields as { Account?: unknown } | undefined)?.Account;
    if (typeof account === "string") return account;
  }
  return undefined;
}

/** A parser result, or undefined if the meta has an unexpected shape. History reads never throw. */
function safely<T>(parse: () => T): T | undefined {
  try {
    return parse();
  } catch {
    return undefined;
  }
}

export function toLedgerTxRecord(entry: RawAccountTxEntry): LedgerTxRecord | undefined {
  const tx = entry.tx_json ?? entry.tx;
  if (!tx || entry.validated === false) return undefined;
  const meta =
    entry.meta && typeof entry.meta === "object"
      ? (entry.meta as Record<string, unknown>)
      : undefined;
  const hash = entry.hash ?? (typeof tx.hash === "string" ? tx.hash : undefined);
  if (!hash) return undefined;
  const type = String(tx.TransactionType);
  const metaInput = meta as never;

  let nftId: string | undefined = typeof tx.NFTokenID === "string" ? tx.NFTokenID : undefined;
  let amount: Amount | undefined;
  let offerId: string | undefined;
  if (type === "Payment") {
    // API v2 names the field DeliverMax. delivered_amount is what actually arrived.
    amount = asAmount(meta?.delivered_amount) ?? asAmount(tx.DeliverMax ?? tx.Amount);
    if (meta?.delivered_amount === "unavailable") amount = undefined;
  } else if (type === "NFTokenCreateOffer") {
    amount = asAmount(tx.Amount);
    offerId = meta ? getCreatedOfferId(metaInput) : undefined;
  } else if (type === "NFTokenMint") {
    nftId = meta ? safely(() => getMintedNftId(metaInput)) : undefined;
    if (tx.Amount !== undefined) {
      amount = asAmount(tx.Amount);
      offerId = meta ? getCreatedOfferId(metaInput) : undefined;
    }
  } else if (type === "NFTokenAcceptOffer") {
    nftId = meta ? getAcceptedNftId(metaInput) : undefined;
    offerId = typeof tx.NFTokenSellOffer === "string" ? tx.NFTokenSellOffer : undefined;
  }

  return {
    hash,
    type,
    account: String(tx.Account),
    destination: typeof tx.Destination === "string" ? tx.Destination : undefined,
    result: typeof meta?.TransactionResult === "string" ? meta.TransactionResult : "unknown",
    nftId,
    amount,
    offerId,
    createdAccount: createdAccountOf(meta),
    memos: readMemos(tx.Memos),
  };
}

/** The token value of an amount, if it is the configured token. Undefined for XRP or other tokens. */
export function tokenValueOf(
  amount: Amount | undefined,
  config: Pick<LedgerConfig, "XRPL_TOKEN_CURRENCY" | "XRPL_TOKEN_ISSUER">,
): string | undefined {
  if (!amount || typeof amount === "string") return undefined;
  if (amount.currency.toUpperCase() !== config.XRPL_TOKEN_CURRENCY.toUpperCase()) return undefined;
  if (amount.issuer !== config.XRPL_TOKEN_ISSUER) return undefined;
  return normalizeLedgerValue(amount.value);
}

export interface AccountHistoryOptions {
  /** Transactions per account_tx page. Default 200. */
  pageSize?: number | undefined;
}

/**
 * Every validated transaction that affected the account, newest first. Always scans the whole
 * history the server has (ledger_index_min -1), page by page with the marker.
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
      ledger_index_min: -1,
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

/**
 * Like listAccountTransactions, but proves that the history is complete: its oldest transaction
 * must be the one that created the account. A server with only recent ledgers would hide old
 * refunds, so this throws a LedgerError with code HISTORY_INCOMPLETE instead.
 */
export async function listCompleteAccountHistory(
  client: Client,
  address: string,
  options: AccountHistoryOptions = {},
): Promise<LedgerTxRecord[]> {
  const records = await listAccountTransactions(client, address, options);
  if (records.at(-1)?.createdAccount !== address) {
    throw new LedgerError(
      `The XRPL server does not have the full history of ${address}: the transaction that created the account is missing. Use a full-history server.`,
      "HISTORY_INCOMPLETE",
    );
  }
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
