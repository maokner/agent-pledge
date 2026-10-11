import type { Wallet } from "xrpl";
import { LedgerError } from "../errors.js";
import { resolveContext, submitOp, type OpsContext } from "./context.js";
import { buildMemos } from "./memo.js";
import { getAcceptedNftId } from "./meta.js";
import type { ClaimResult } from "./types.js";

export interface AcceptOfferInput {
  claimer: Wallet;
  /** The sell offer index from offerTaskToAgent or offerSubtaskToAnyone. */
  offerId: string;
  /** Board label. Defaults to "task.claim". */
  kind?: "task.claim" | "subtask.claim" | undefined;
  /** Optional memos for the audit trail. */
  taskId?: string | undefined;
  subtaskId?: string | undefined;
}

/**
 * Demo steps 7 and 10 (claim): NFTokenAcceptOffer by the claimer.
 * For the task NFT this also pays the pledge in the same transaction.
 * Throws AlreadyClaimedError (from the core submitTx) when another claimer accepted first.
 */
export async function acceptOffer(
  input: AcceptOfferInput,
  ctx?: Partial<OpsContext>,
): Promise<ClaimResult> {
  const c = await resolveContext(ctx);
  const kind = input.kind ?? "task.claim";
  const { response, tx } = await submitOp(
    c,
    input.claimer,
    {
      TransactionType: "NFTokenAcceptOffer",
      Account: input.claimer.classicAddress,
      NFTokenSellOffer: input.offerId,
      Memos: buildMemos({ task: input.taskId, subtask: input.subtaskId, action: kind }),
    },
    kind,
  );
  const nftId = getAcceptedNftId(response.result.meta);
  if (!nftId) throw new LedgerError(`No NFTokenID in accept ${tx.hash}`, "META_PARSE", response);
  return { ...tx, nftId, holder: input.claimer.classicAddress };
}
