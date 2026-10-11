import type { Client, NFTOffer, Wallet } from "xrpl";
import { OfferMismatchError } from "../errors.js";
import { buildMemos, type MemoFields } from "../memo.js";
import type { SubmittedTx } from "../types.js";
import { compareIouValues, tokenAmount, type DecimalInput } from "./amount.js";
import { resolveContext, submitOp, type OpsContext } from "./context.js";
import { withTaskLock } from "./lock.js";
import { createSellOffer } from "./nft.js";
import { tokenValueOf } from "./state.js";
import type { OfferResult, RedeemResult } from "./types.js";

/** Audit memos for payout and burn transactions. With a taskId, payouts also take the task lock. */
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

function createPayoutOfferUnlocked(input: CreatePayoutOfferInput, c: OpsContext) {
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

/**
 * Demo step 13, first half: the holder offers the NFT to the vault for the payout.
 * With a taskId, it runs under the task lock (see taskLockKey).
 */
export async function createPayoutOffer(
  input: CreatePayoutOfferInput,
  ctx?: Partial<OpsContext>,
): Promise<OfferResult> {
  const c = await resolveContext(ctx);
  return withTaskLock(input.vaultAddress, input.taskId, () => createPayoutOfferUnlocked(input, c));
}

export interface AcceptPayoutOfferInput extends AuditIds {
  vault: Wallet;
  offerId: string;
  /** The NFT the offer must sell. */
  nftId: string;
  /** The account that must own the offer: the helper or the local agent who holds the NFT. */
  holderAddress: string;
  /** The payout the offer must ask, in the configured token. */
  amount: DecimalInput;
}

function isObjectNotFound(error: unknown): boolean {
  return (error as { data?: { error?: unknown } } | undefined)?.data?.error === "objectNotFound";
}

/** Every sell offer for the NFT in the validated ledger. */
async function listSellOffers(client: Client, nftId: string): Promise<NFTOffer[]> {
  const offers: NFTOffer[] = [];
  let marker: unknown;
  do {
    let result: { offers: NFTOffer[]; marker?: unknown };
    try {
      ({ result } = await client.request({
        command: "nft_sell_offers",
        nft_id: nftId,
        ledger_index: "validated",
        ...(marker === undefined ? {} : { marker }),
      }));
    } catch (error) {
      // rippled answers objectNotFound when the NFT has no sell offers.
      if (isObjectNotFound(error)) return offers;
      throw error;
    }
    offers.push(...result.offers);
    marker = result.marker;
  } while (marker !== undefined);
  return offers;
}

/**
 * Checks the offer on the ledger before the vault signs anything. An offer cannot change after it
 * is created (its index comes from the owner and Sequence), so a checked offer stays checked.
 * Throws OfferMismatchError with every problem found.
 */
async function verifyPayoutOffer(input: AcceptPayoutOfferInput, c: OpsContext): Promise<void> {
  const vault = input.vault.classicAddress;
  const offers = await listSellOffers(c.client, input.nftId);
  const offer = offers.find((o) => o.nft_offer_index.toUpperCase() === input.offerId.toUpperCase());
  if (!offer) {
    throw new OfferMismatchError(input.offerId, [
      `it is not a sell offer for NFT ${input.nftId} in the validated ledger`,
    ]);
  }
  const problems: string[] = [];
  if (offer.owner !== input.holderAddress) {
    problems.push(`owner is ${offer.owner}, expected the holder ${input.holderAddress}`);
  }
  if (offer.destination !== vault) {
    problems.push(`Destination is ${offer.destination ?? "(none)"}, expected the vault ${vault}`);
  }
  const expected = tokenAmount(c.config, input.amount);
  const amount = offer.amount;
  if (typeof amount === "string") {
    problems.push(`Amount is ${amount} XRP drops, expected ${expected.value} of the token`);
  } else {
    const value = tokenValueOf(amount, c.config);
    if (value === undefined) {
      problems.push(
        `Amount is in ${amount.currency} of ${amount.issuer}, expected ${expected.currency} of ${expected.issuer}`,
      );
    } else if (compareIouValues(value, expected.value) !== 0) {
      problems.push(`Amount is ${amount.value}, expected ${expected.value}`);
    }
  }
  if (problems.length > 0) throw new OfferMismatchError(input.offerId, problems);
}

async function acceptPayoutOfferUnlocked(
  input: AcceptPayoutOfferInput,
  c: OpsContext,
): Promise<SubmittedTx> {
  await verifyPayoutOffer(input, c);
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

/**
 * Demo step 13, second half: the vault accepts. The NFT and the money swap in one transaction.
 * First it reads the offer from the validated ledger (nft_sell_offers) and checks that it sells
 * `nftId`, is owned by `holderAddress`, has the vault as Destination, and asks exactly `amount` of
 * the configured token. Any difference throws OfferMismatchError and submits nothing.
 * With a taskId, it runs under the task lock (see taskLockKey).
 */
export async function acceptPayoutOffer(
  input: AcceptPayoutOfferInput,
  ctx?: Partial<OpsContext>,
): Promise<SubmittedTx> {
  const c = await resolveContext(ctx);
  return withTaskLock(input.vault.classicAddress, input.taskId, () =>
    acceptPayoutOfferUnlocked(input, c),
  );
}

export interface RedeemInput extends AuditIds {
  holder: Wallet;
  vault: Wallet;
  nftId: string;
  amount: DecimalInput;
}

/**
 * Demo step 13 (payout swap): the holder sells the NFT to the vault for the payout, then the vault
 * checks the offer and accepts. Returns both transactions. With a taskId, both run under one task
 * lock, so a failTask for the same task waits until the swap is done (and then finds it paid out).
 */
export async function redeem(input: RedeemInput, ctx?: Partial<OpsContext>): Promise<RedeemResult> {
  const c = await resolveContext(ctx);
  const ids: AuditIds = { taskId: input.taskId, subtaskId: input.subtaskId };
  const vaultAddress = input.vault.classicAddress;
  return withTaskLock(vaultAddress, input.taskId, async () => {
    const offer = await createPayoutOfferUnlocked(
      { ...ids, holder: input.holder, vaultAddress, nftId: input.nftId, amount: input.amount },
      c,
    );
    const accept = await acceptPayoutOfferUnlocked(
      {
        ...ids,
        vault: input.vault,
        offerId: offer.offerId,
        nftId: input.nftId,
        holderAddress: input.holder.classicAddress,
        amount: input.amount,
      },
      c,
    );
    return { offer, accept };
  });
}

export interface BurnNftInput extends AuditIds {
  vault: Wallet;
  nftId: string;
  /** The current holder, if it is not the vault. The vault is the issuer, so it can burn anyway. */
  owner?: string | undefined;
}

/**
 * Demo step 13 (close) and the failure flow: NFTokenBurn by the vault.
 * It does not take the task lock, because failTask calls it under that lock.
 */
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
