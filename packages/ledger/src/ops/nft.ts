import {
  NFTokenCreateOfferFlags,
  NFTokenMintFlags,
  type IssuedCurrencyAmount,
  type Memo,
  type NFTokenMint,
  type Wallet,
} from "xrpl";
import { LedgerError } from "../errors.js";
import { submitOp, type OpsContext } from "./context.js";
import { getCreatedOfferId, getMintedNftId } from "./meta.js";
import type { MintOfferResult, MintResult, OfferResult } from "./types.js";
import { encodeNftUri } from "./uri.js";

/** NFTokenTaxon for task NFTs. Sub-task NFTs use SUBTASK_NFT_TAXON. */
export const TASK_NFT_TAXON = 1;
export const SUBTASK_NFT_TAXON = 2;

/** Every task and sub-task NFT: the vault can burn it from any holder, and it can change hands. */
export const TASK_NFT_FLAGS = NFTokenMintFlags.tfBurnable | NFTokenMintFlags.tfTransferable;

export interface MintNftParams {
  vault: Wallet;
  uri: string;
  taxon: number;
  memos: Memo[];
  kind: "task.mint" | "subtask.mint";
}

/** A sell offer that NFTokenMint makes in the same transaction (the NFTokenMintOffer amendment). */
export interface MintOfferParams {
  /** XRP drops as a string, or a token amount. */
  amount: string | IssuedCurrencyAmount;
  destination?: string | undefined;
}

function mintTx(params: MintNftParams, offer?: MintOfferParams): NFTokenMint {
  return {
    TransactionType: "NFTokenMint",
    Account: params.vault.classicAddress,
    NFTokenTaxon: params.taxon,
    Flags: TASK_NFT_FLAGS,
    TransferFee: 0,
    URI: encodeNftUri(params.uri),
    ...(offer ? { Amount: offer.amount } : {}),
    ...(offer?.destination === undefined ? {} : { Destination: offer.destination }),
    Memos: params.memos,
  };
}

/** Shared NFTokenMint for task and sub-task NFTs. */
export async function mintNft(params: MintNftParams, c: OpsContext): Promise<MintResult> {
  const { response, tx } = await submitOp(c, params.vault, mintTx(params), params.kind);
  const nftId = getMintedNftId(response.result.meta);
  if (!nftId) throw new LedgerError(`No NFTokenID in mint ${tx.hash}`, "META_PARSE", response);
  return { ...tx, nftId };
}

/**
 * NFTokenMint with Amount (and an optional Destination): the NFT and its sell offer in one
 * transaction, one ledger instead of two. Spike step 7 checked it on testnet.
 */
export async function mintNftWithOffer(
  params: MintNftParams,
  offer: MintOfferParams,
  c: OpsContext,
): Promise<MintOfferResult> {
  const { response, tx } = await submitOp(c, params.vault, mintTx(params, offer), params.kind);
  const nftId = getMintedNftId(response.result.meta);
  if (!nftId) throw new LedgerError(`No NFTokenID in mint ${tx.hash}`, "META_PARSE", response);
  const offerId = getCreatedOfferId(response.result.meta);
  if (!offerId) throw new LedgerError(`No NFTokenOffer in mint ${tx.hash}`, "META_PARSE", response);
  return { ...tx, nftId, offerId };
}

export interface SellOfferParams {
  seller: Wallet;
  nftId: string;
  /** XRP drops as a string, or a token amount. */
  amount: string | IssuedCurrencyAmount;
  destination?: string | undefined;
  memos: Memo[];
  kind: "task.offer" | "subtask.offer" | "payout.offer";
}

/** Shared NFTokenCreateOffer (sell). Returns the offer index from the CreatedNode in the meta. */
export async function createSellOffer(
  params: SellOfferParams,
  c: OpsContext,
): Promise<OfferResult> {
  const { response, tx } = await submitOp(
    c,
    params.seller,
    {
      TransactionType: "NFTokenCreateOffer",
      Account: params.seller.classicAddress,
      NFTokenID: params.nftId,
      Amount: params.amount,
      Flags: NFTokenCreateOfferFlags.tfSellNFToken,
      ...(params.destination === undefined ? {} : { Destination: params.destination }),
      Memos: params.memos,
    },
    params.kind,
  );
  const offerId = getCreatedOfferId(response.result.meta);
  if (!offerId) throw new LedgerError(`No NFTokenOffer in ${tx.hash}`, "META_PARSE", response);
  return { ...tx, offerId };
}
