import type { Wallet } from "xrpl";
import type { SubmittedTx } from "../types.js";
import { tokenAmount, type DecimalInput } from "./amount.js";
import { resolveContext, submitOp, type OpsContext } from "./context.js";
import { buildMemos, type MemoFields } from "./memo.js";
import { createSellOffer } from "./nft.js";
import type { OfferResult, RedeemResult } from "./types.js";

/** Optional audit memos for payout and burn transactions. */
export interface AuditIds {
  taskId?: string | undefined;
  subtaskId?: string | undefined;
}

function auditMemos(ids: AuditIds, action: MemoFields["action"]) {
  return buildMemos({ task: ids.taskId, subtask: ids.subtaskId, action });
}

export interface CreatePayoutOfferInput extends AuditIds {
  holder: Wallet;
  vaultAddress: string;
  nftId: string;
  /** The payout in the token: "4" for the helper, "6" for the local agent in the demo. */
  amount: DecimalInput;
}

/** Demo step 13, first half: the holder offers the NFT to the vault for the payout. */
export async function createPayoutOffer(
  input: CreatePayoutOfferInput,
  ctx?: Partial<OpsContext>,
): Promise<OfferResult> {
  const c = await resolveContext(ctx);
  return createSellOffer(
    {
      seller: input.holder,
      nftId: input.nftId,
      amount: tokenAmount(c.config, input.amount),
      destination: input.vaultAddress,
      memos: auditMemos(input, "payout.offer"),
      kind: "payout.offer",
    },
    c,
  );
}

export interface AcceptPayoutOfferInput extends AuditIds {
  vault: Wallet;
  offerId: string;
}

/** Demo step 13, second half: the vault accepts. The NFT and the money swap in one transaction. */
export async function acceptPayoutOffer(
  input: AcceptPayoutOfferInput,
  ctx?: Partial<OpsContext>,
): Promise<SubmittedTx> {
  const c = await resolveContext(ctx);
  const { tx } = await submitOp(
    c,
    input.vault,
    {
      TransactionType: "NFTokenAcceptOffer",
      Account: input.vault.classicAddress,
      NFTokenSellOffer: input.offerId,
      Memos: auditMemos(input, "payout.accept"),
    },
    "payout.accept",
  );
  return tx;
}

export interface RedeemInput extends AuditIds {
  holder: Wallet;
  vault: Wallet;
  nftId: string;
  amount: DecimalInput;
}

/**
 * Demo step 13 (payout swap): the holder sells the NFT to the vault for the payout, then the vault
 * accepts. Returns both transactions. Safe to run for several holders at once: vault transactions
 * are queued per account.
 */
export async function redeem(input: RedeemInput, ctx?: Partial<OpsContext>): Promise<RedeemResult> {
  const c = await resolveContext(ctx);
  const ids: AuditIds = { taskId: input.taskId, subtaskId: input.subtaskId };
  const offer = await createPayoutOffer(
    {
      ...ids,
      holder: input.holder,
      vaultAddress: input.vault.classicAddress,
      nftId: input.nftId,
      amount: input.amount,
    },
    c,
  );
  const accept = await acceptPayoutOffer({ ...ids, vault: input.vault, offerId: offer.offerId }, c);
  return { offer, accept };
}

export interface BurnNftInput extends AuditIds {
  vault: Wallet;
  nftId: string;
  /** The current holder, if it is not the vault. The vault is the issuer, so it can burn anyway. */
  owner?: string | undefined;
}

/** Demo step 13 (close) and the failure flow: NFTokenBurn by the vault. */
export async function burnNft(
  input: BurnNftInput,
  ctx?: Partial<OpsContext>,
): Promise<SubmittedTx> {
  const c = await resolveContext(ctx);
  const owner =
    input.owner !== undefined && input.owner !== input.vault.classicAddress
      ? { Owner: input.owner }
      : {};
  const { tx } = await submitOp(
    c,
    input.vault,
    {
      TransactionType: "NFTokenBurn",
      Account: input.vault.classicAddress,
      NFTokenID: input.nftId,
      ...owner,
      Memos: auditMemos(input, "nft.burn"),
    },
    "nft.burn",
  );
  return tx;
}
