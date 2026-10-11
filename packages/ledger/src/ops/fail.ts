import type { Wallet } from "xrpl";
import { LedgerError } from "../errors.js";
import type { SubmittedTx } from "../types.js";
import { addIouValues, isZeroIouValue, tokenAmount, type DecimalInput } from "./amount.js";
import { resolveContext, submitOp, type OpsContext } from "./context.js";
import { buildMemos, type MemoFields } from "./memo.js";
import { burnNft } from "./payout.js";
import { runExclusive } from "./queue.js";
import { findNftHolder, listAccountTransactions, type LedgerTxRecord } from "./state.js";

export interface FailSubtaskInput {
  subtaskId: string;
  /** The sub-task NFT, if it was minted. */
  nftId?: string | undefined;
  /** The sub-task money the local agent paid into the vault. It goes back to the agent. */
  amount: DecimalInput;
  /** The helper who claimed the sub-task, if any. Used to find the NFT holder for the burn. */
  helperAddress?: string | undefined;
}

export interface FailTaskInput {
  vault: Wallet;
  taskId: string;
  /** The task NFT, if it was minted. */
  taskNftId?: string | undefined;
  requesterAddress: string;
  /** The task price the requester paid, for example "5". */
  price: DecimalInput;
  /** The pledge the agent paid when it claimed, for example "1". Pass "0" if it never claimed. */
  pledge: DecimalInput;
  /** The local agent. Required when there are sub-tasks, because it gets their money back. */
  agentAddress?: string | undefined;
  subtasks?: readonly FailSubtaskInput[] | undefined;
  /** Oldest ledger to scan for earlier burns and refunds, for example the ledger of the task fund. */
  ledgerIndexMin?: number | undefined;
}

export interface FailTaskResult {
  burns: SubmittedTx[];
  refunds: SubmittedTx[];
  /** Steps already done on the ledger. This call did not repeat them. */
  skipped: string[];
}

/** What the vault's history says about earlier failTask and payout transactions. */
export interface VaultState {
  burnedNftIds: ReadonlySet<string>;
  /** NFTs the vault bought back in a payout swap. A paid-out task must not also be refunded. */
  paidOutNftIds: ReadonlySet<string>;
  refundKeys: ReadonlySet<string>;
}

export type FailStep =
  | { type: "burn"; label: string; nftId: string; holderCandidates: string[]; memos: MemoFields }
  | { type: "refund"; label: string; destination: string; amount: string; memos: MemoFields };

export interface FailPlan {
  steps: FailStep[];
  skipped: string[];
}

/** Identifies one refund: who got it, and for which task or sub-task. */
export function refundKey(destination: string, memos: MemoFields): string {
  return `${destination}|${memos.task ?? ""}|${memos.subtask ?? ""}`;
}

export function vaultStateFromHistory(
  vaultAddress: string,
  history: readonly LedgerTxRecord[],
): VaultState {
  const burnedNftIds = new Set<string>();
  const paidOutNftIds = new Set<string>();
  const refundKeys = new Set<string>();
  for (const tx of history) {
    if (tx.result !== "tesSUCCESS") continue;
    if (tx.type === "NFTokenBurn" && tx.nftId) burnedNftIds.add(tx.nftId);
    if (tx.type === "NFTokenAcceptOffer" && tx.account === vaultAddress && tx.nftId) {
      paidOutNftIds.add(tx.nftId);
    }
    if (
      tx.type === "Payment" &&
      tx.account === vaultAddress &&
      tx.destination &&
      tx.memos.action === "refund"
    ) {
      refundKeys.add(refundKey(tx.destination, tx.memos));
    }
  }
  return { burnedNftIds, paidOutNftIds, refundKeys };
}

/**
 * Plans the failure flow (PRD 2.3 and the failure row of 5.4) from the on-ledger state.
 * Burns come first, so no holder can redeem after the refunds. Steps already on the ledger are
 * skipped. Throws if a task or sub-task NFT was already paid out, because then the task did not fail.
 */
export function planFailTask(input: FailTaskInput, state: VaultState): FailPlan {
  const vault = input.vault.classicAddress;
  const subtasks = input.subtasks ?? [];
  if (subtasks.length > 0 && !input.agentAddress) {
    throw new TypeError("failTask needs agentAddress to refund the sub-task money.");
  }
  const steps: FailStep[] = [];
  const skipped: string[] = [];

  const nfts: { label: string; nftId: string; holders: string[]; memos: MemoFields }[] = [];
  if (input.taskNftId) {
    nfts.push({
      label: `burn task NFT ${input.taskNftId}`,
      nftId: input.taskNftId,
      holders: [vault, input.agentAddress].filter((a): a is string => !!a),
      memos: { task: input.taskId },
    });
  }
  for (const sub of subtasks) {
    if (!sub.nftId) continue;
    nfts.push({
      label: `burn sub-task NFT ${sub.nftId}`,
      nftId: sub.nftId,
      holders: [vault, sub.helperAddress, input.agentAddress].filter((a): a is string => !!a),
      memos: { task: input.taskId, subtask: sub.subtaskId },
    });
  }
  for (const nft of nfts) {
    if (state.paidOutNftIds.has(nft.nftId)) {
      throw new LedgerError(
        `NFT ${nft.nftId} of task ${input.taskId} was already paid out. Not failing the task.`,
        "ALREADY_PAID_OUT",
      );
    }
    if (state.burnedNftIds.has(nft.nftId)) skipped.push(`${nft.label}: already burned`);
    else {
      steps.push({
        type: "burn",
        label: nft.label,
        nftId: nft.nftId,
        holderCandidates: nft.holders,
        memos: nft.memos,
      });
    }
  }

  const refunds: { label: string; destination: string; amount: string; memos: MemoFields }[] = [
    {
      label: `refund price + pledge to requester ${input.requesterAddress}`,
      destination: input.requesterAddress,
      amount: addIouValues(input.price, input.pledge),
      memos: { task: input.taskId },
    },
    ...subtasks.map((sub) => ({
      label: `refund sub-task ${sub.subtaskId} money to agent ${input.agentAddress}`,
      destination: input.agentAddress as string,
      amount: addIouValues(sub.amount),
      memos: { task: input.taskId, subtask: sub.subtaskId },
    })),
  ];
  for (const refund of refunds) {
    if (isZeroIouValue(refund.amount)) skipped.push(`${refund.label}: amount is zero`);
    else if (state.refundKeys.has(refundKey(refund.destination, refund.memos))) {
      skipped.push(`${refund.label}: already sent`);
    } else steps.push({ type: "refund", ...refund });
  }
  return { steps, skipped };
}

/**
 * The failure flow: the vault burns the task NFT and every sub-task NFT, then refunds the requester
 * (price + pledge) and the agent (sub-task money). Idempotent: it reads the vault's history first and
 * skips burns and refunds that are already on the ledger, so a second call pays nothing.
 * Calls for the same vault and task in one process run one after another.
 */
export async function failTask(
  input: FailTaskInput,
  ctx?: Partial<OpsContext>,
): Promise<FailTaskResult> {
  const c = await resolveContext(ctx);
  const vault = input.vault.classicAddress;
  return runExclusive(`failTask|${vault}|${input.taskId}`, async () => {
    const history = await listAccountTransactions(c.client, vault, {
      ledgerIndexMin: input.ledgerIndexMin,
    });
    const plan = planFailTask(input, vaultStateFromHistory(vault, history));
    const result: FailTaskResult = { burns: [], refunds: [], skipped: [...plan.skipped] };

    for (const step of plan.steps) {
      if (step.type === "burn") {
        const holder = await findNftHolder(c.client, step.nftId, step.holderCandidates);
        if (!holder) {
          throw new LedgerError(
            `NFT ${step.nftId} is not burned and none of ${step.holderCandidates.join(", ")} holds it.`,
            "NFT_HOLDER_UNKNOWN",
          );
        }
        try {
          result.burns.push(
            await burnNft(
              {
                vault: input.vault,
                nftId: step.nftId,
                owner: holder,
                taskId: step.memos.task,
                subtaskId: step.memos.subtask,
              },
              c,
            ),
          );
        } catch (error) {
          // Burned between the history read and now. The goal of the step is met.
          if (error instanceof LedgerError && error.code === "tecNO_ENTRY") {
            result.skipped.push(`${step.label}: already burned`);
          } else throw error;
        }
      } else {
        const { tx } = await submitOp(
          c,
          input.vault,
          {
            TransactionType: "Payment",
            Account: vault,
            Destination: step.destination,
            Amount: tokenAmount(c.config, step.amount),
            Memos: buildMemos({ ...step.memos, action: "refund" }),
          },
          "refund",
        );
        result.refunds.push(tx);
      }
    }
    return result;
  });
}
