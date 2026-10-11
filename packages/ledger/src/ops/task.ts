import type { Wallet } from "xrpl";
import type { SubmittedTx } from "../types.js";
import { tokenAmount, type DecimalInput } from "./amount.js";
import {
  addressOf,
  resolveContext,
  submitOp,
  type AccountRef,
  type OpsContext,
} from "./context.js";
import { buildMemos } from "./memo.js";
import { createSellOffer, mintNft, TASK_NFT_TAXON } from "./nft.js";
import type { MintResult, OfferResult } from "./types.js";

export interface FundTaskInput {
  requester: Wallet;
  vault: AccountRef;
  /** The task price in the token, for example "5". */
  amount: DecimalInput;
  taskId: string;
}

/** Demo step 5 (money escrow): Payment of the task price from the requester to the vault. */
export async function fundTask(
  input: FundTaskInput,
  ctx?: Partial<OpsContext>,
): Promise<SubmittedTx> {
  const c = await resolveContext(ctx);
  const { tx } = await submitOp(
    c,
    input.requester,
    {
      TransactionType: "Payment",
      Account: input.requester.classicAddress,
      Destination: addressOf(input.vault),
      Amount: tokenAmount(c.config, input.amount),
      Memos: buildMemos({ task: input.taskId, action: "task.fund" }),
    },
    "task.fund",
  );
  return tx;
}

export interface MintTaskNftInput {
  vault: Wallet;
  /** URL of the task data on the server. Stored hex-encoded in the NFT URI. */
  uri: string;
  taskId: string;
}

/** Demo step 5 (task NFT): NFTokenMint by the vault with tfBurnable and tfTransferable. */
export async function mintTaskNft(
  input: MintTaskNftInput,
  ctx?: Partial<OpsContext>,
): Promise<MintResult> {
  const c = await resolveContext(ctx);
  return mintNft(
    {
      vault: input.vault,
      uri: input.uri,
      taxon: TASK_NFT_TAXON,
      memos: buildMemos({ task: input.taskId, action: "task.mint" }),
      kind: "task.mint",
    },
    c,
  );
}

export interface OfferTaskToAgentInput {
  vault: Wallet;
  nftId: string;
  /** The pledge in the token, for example "1". The agent pays it when it accepts. */
  pledgeAmount: DecimalInput;
  agentAddress: string;
  /** The task ID memo. failTask finds the pledge on the ledger by this memo. */
  taskId: string;
}

/** Demo step 7 (offer): sell offer for the pledge, only for the local agent (Destination). */
export async function offerTaskToAgent(
  input: OfferTaskToAgentInput,
  ctx?: Partial<OpsContext>,
): Promise<OfferResult> {
  const c = await resolveContext(ctx);
  return createSellOffer(
    {
      seller: input.vault,
      nftId: input.nftId,
      amount: tokenAmount(c.config, input.pledgeAmount),
      destination: input.agentAddress,
      memos: buildMemos({ task: input.taskId, action: "task.offer" }),
      kind: "task.offer",
    },
    c,
  );
}
