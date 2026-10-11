import type { Amount, Wallet } from "xrpl";
import { LedgerError } from "../errors.js";
import type { SubmittedTx } from "../types.js";
import { isZeroIouValue, tokenAmount, type DecimalInput } from "./amount.js";
import {
  addressOf,
  resolveContext,
  submitOp,
  type AccountRef,
  type OpsContext,
} from "./context.js";
import { buildMemos } from "../memo.js";
import {
  createSellOffer,
  mintNft,
  mintNftWithOffer,
  SUBTASK_NFT_TAXON,
  type MintNftParams,
} from "./nft.js";
import type { MintOfferResult, MintResult, OfferResult } from "./types.js";

/**
 * Price of the open sub-task offer, in XRP drops.
 * Verified on XRPL testnet (rippled 3.4.1, 2026-10-11): a sell offer with Amount "0" and no
 * Destination is accepted, and any account can then take it for free.
 */
export const OPEN_OFFER_AMOUNT = "0";

export interface FundSubtaskInput {
  agent: Wallet;
  vault: AccountRef;
  /** The sub-task price in the token, for example "4". */
  amount: DecimalInput;
  subtaskId: string;
  /** The parent task ID, so the ledger shows which task paid for which sub-task. */
  taskId: string;
}

/** Demo step 8 (sub-task money): Payment of the sub-task price from the local agent to the vault. */
export async function fundSubtask(
  input: FundSubtaskInput,
  ctx?: Partial<OpsContext>,
): Promise<SubmittedTx> {
  const c = await resolveContext(ctx);
  const { tx } = await submitOp(
    c,
    input.agent,
    {
      TransactionType: "Payment",
      Account: input.agent.classicAddress,
      Destination: addressOf(input.vault),
      Amount: tokenAmount(c.config, input.amount),
      Memos: buildMemos({ task: input.taskId, subtask: input.subtaskId, action: "subtask.fund" }),
    },
    "subtask.fund",
  );
  return tx;
}

export interface MintSubtaskNftInput {
  vault: Wallet;
  /** URL of the sub-task data on the server. The data carries parent_nft_id (PRD 5.3). */
  uri: string;
  subtaskId: string;
  /** The parent task ID. Written as the task memo, so the mint events carry it. */
  taskId: string;
  /** The task NFT ID (64 hex characters). Also written as a memo, so the parent link is on the ledger. */
  parentNftId: string;
}

const NFT_ID_PATTERN = /^[0-9A-Fa-f]{64}$/;

function subtaskMintParams(input: MintSubtaskNftInput): MintNftParams {
  if (!NFT_ID_PATTERN.test(input.parentNftId)) {
    throw new LedgerError(
      `parentNftId must be the 64 hex character task NFT ID, not "${input.parentNftId}"`,
      "INVALID_INPUT",
    );
  }
  return {
    vault: input.vault,
    uri: input.uri,
    taxon: SUBTASK_NFT_TAXON,
    memos: buildMemos({
      task: input.taskId,
      subtask: input.subtaskId,
      parentNft: input.parentNftId,
      action: "subtask.mint",
    }),
    kind: "subtask.mint",
  };
}

/** Throws for a zero token amount: rippled returns temBAD_AMOUNT. Zero is legal only in XRP drops. */
function checkOpenOfferAmount(amount: Amount): Amount {
  if (typeof amount !== "string" && isZeroIouValue(amount.value)) {
    throw new TypeError('A zero-price open offer must use XRP drops ("0"), not a token amount.');
  }
  return amount;
}

/** Demo step 8 (sub-task NFT): NFTokenMint by the vault with tfBurnable and tfTransferable. */
export async function mintSubtaskNft(
  input: MintSubtaskNftInput,
  ctx?: Partial<OpsContext>,
): Promise<MintResult> {
  const params = subtaskMintParams(input);
  return mintNft(params, await resolveContext(ctx));
}

export interface MintSubtaskNftWithOfferInput extends MintSubtaskNftInput {
  /** Offer price. Defaults to OPEN_OFFER_AMOUNT ("0" drops of XRP). See OfferSubtaskToAnyoneInput. */
  amount?: Amount | undefined;
}

/**
 * Demo step 8 in one transaction: NFTokenMint with Amount "0" (XRP drops) and no Destination.
 * It makes the sub-task NFT and the open offer at once, one ledger sooner than mintSubtaskNft then
 * offerSubtaskToAnyone. The board sees one `subtask.mint` transaction.
 */
export async function mintSubtaskNftWithOffer(
  input: MintSubtaskNftWithOfferInput,
  ctx?: Partial<OpsContext>,
): Promise<MintOfferResult> {
  const params = subtaskMintParams(input);
  const amount = checkOpenOfferAmount(input.amount ?? OPEN_OFFER_AMOUNT);
  return mintNftWithOffer(params, { amount }, await resolveContext(ctx));
}

export interface OfferSubtaskToAnyoneInput {
  vault: Wallet;
  nftId: string;
  /**
   * Offer price. Defaults to OPEN_OFFER_AMOUNT ("0" drops of XRP). A zero price must be in XRP
   * drops: a zero token amount is temBAD_AMOUNT.
   */
  amount?: Amount | undefined;
  subtaskId: string;
  /** The parent task ID. Written as the task memo, so the offer events carry it. */
  taskId: string;
}

/** Demo step 8 (open offer): sell offer with no Destination. The first helper to accept gets it. */
export async function offerSubtaskToAnyone(
  input: OfferSubtaskToAnyoneInput,
  ctx?: Partial<OpsContext>,
): Promise<OfferResult> {
  const c = await resolveContext(ctx);
  const amount = checkOpenOfferAmount(input.amount ?? OPEN_OFFER_AMOUNT);
  return createSellOffer(
    {
      seller: input.vault,
      nftId: input.nftId,
      amount,
      memos: buildMemos({ task: input.taskId, subtask: input.subtaskId, action: "subtask.offer" }),
      kind: "subtask.offer",
    },
    c,
  );
}
