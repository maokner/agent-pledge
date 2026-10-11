import type { SubmittedTx } from "../types.js";

export interface MintResult extends SubmittedTx {
  nftId: string;
}

export interface OfferResult extends SubmittedTx {
  offerId: string;
}

export interface ClaimResult extends SubmittedTx {
  nftId: string;
  /** The address that holds the NFT after the claim. */
  holder: string;
}

export interface RedeemResult {
  /** The holder's sell offer to the vault. */
  offer: OfferResult;
  /** The vault's NFTokenAcceptOffer. The NFT goes back to the vault and the holder gets paid. */
  accept: SubmittedTx;
}
