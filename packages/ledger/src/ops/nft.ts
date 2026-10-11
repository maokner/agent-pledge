import {
  NFTokenCreateOfferFlags,
  NFTokenMintFlags,
  type IssuedCurrencyAmount,
  type Memo,
  type Wallet,
} from "xrpl";
import { LedgerError } from "../errors.js";
import { submitOp, type OpsContext } from "./context.js";
import { getCreatedOfferId, getMintedNftId } from "./meta.js";
import type { MintResult, OfferResult } from "./types.js";
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

/** Shared NFTokenMint for task and sub-task NFTs. */
export async function mintNft(params: MintNftParams, c: OpsContext): Promise<MintResult> {
  const { response, tx } = await submitOp(
    c,
    params.vault,
    {
      TransactionType: "NFTokenMint",
      Account: params.vault.classicAddress,
      NFTokenTaxon: params.taxon,
      Flags: TASK_NFT_FLAGS,
      TransferFee: 0,
      URI: encodeNftUri(params.uri),
      Memos: params.memos,
    },
    params.kind,
  );
  const nftId = getMintedNftId(response.result.meta);
  if (!nftId) throw new LedgerError(`No NFTokenID in mint ${tx.hash}`, "META_PARSE", response);
  return { ...tx, nftId };
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
