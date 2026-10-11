import type { Wallet } from "xrpl";
import { buildMemos } from "../memo.js";
import type { SubmittedTx } from "../types.js";
import { tokenAmount, type DecimalInput } from "./amount.js";
import { resolveContext, submitOp, type OpsContext } from "./context.js";

export interface TransferTokenInput {
  /** The paying wallet, for example a server treasury or the vault. */
  from: Wallet;
  /** The receiving address. It needs a trust line for the token. */
  to: string;
  /** The amount in the configured token, for example "5". */
  amount: DecimalInput;
  /** Optional task memo, so the transfer shows up in the task's audit trail and events. */
  taskId?: string | undefined;
}

/**
 * A Payment of the configured token (RLUSD or the stand-in) with the `token.transfer` action memo.
 * PRD 5.1: the server makes the requester's wallet, so it uses this to put the task money into a
 * new requester wallet before fundTask. It is not a task funding and not a refund, so failTask
 * ignores it.
 */
export async function transferToken(
  input: TransferTokenInput,
  ctx?: Partial<OpsContext>,
): Promise<SubmittedTx> {
  const c = await resolveContext(ctx);
  const { tx } = await submitOp(
    c,
    input.from,
    {
      TransactionType: "Payment",
      Account: input.from.classicAddress,
      Destination: input.to,
      Amount: tokenAmount(c.config, input.amount),
      Memos: buildMemos({ task: input.taskId, action: "token.transfer" }),
    },
    "token.transfer",
  );
  return tx;
}
