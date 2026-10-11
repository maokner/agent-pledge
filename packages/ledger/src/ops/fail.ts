import type { Wallet } from "xrpl";
import type { LedgerConfig } from "../config.js";
import { FundingMismatchError, LedgerError, type FundingReceived } from "../errors.js";
import { buildMemos, type MemoFields } from "../memo.js";
import type { SubmittedTx } from "../types.js";
import {
  addIouValues,
  compareIouValues,
  isZeroIouValue,
  subtractIouValues,
  tokenAmount,
  type DecimalInput,
} from "./amount.js";
import { resolveContext, submitOp, type OpsContext } from "./context.js";
import { withTaskLock } from "./lock.js";
import { burnNft } from "./payout.js";
import {
  findNftHolder,
  listCompleteAccountHistory,
  tokenValueOf,
  type LedgerTxRecord,
} from "./state.js";

export interface FailSubtaskInput {
  subtaskId: string;
  /** The sub-task NFT, if it was minted. */
  nftId?: string | undefined;
  /**
   * The sub-task money the caller expects the local agent paid into the vault. failTask checks it
   * against the agent's validated `subtask.fund` payments. Pass "0" if the funding never validated.
   */
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
  /**
   * The task price the caller expects the requester paid, for example "5". failTask checks it
   * against the requester's validated `task.fund` payments. Pass "0" if the funding never validated.
   */
  price: DecimalInput;
  /**
   * The pledge the caller expects the agent paid when it claimed, for example "1". failTask checks
   * it against the validated accept of the vault's task offer. Pass "0" if the agent never claimed.
   */
  pledge: DecimalInput;
  /** The local agent. Required when there are sub-tasks, because it gets their money back. */
  agentAddress?: string | undefined;
  /** Every sub-task of the task. A funded sub-task that is not listed is a FUNDING_MISMATCH. */
  subtasks?: readonly FailSubtaskInput[] | undefined;
}

/** A failTask transaction with a plain-English label for the board. */
export interface FailTaskTx extends SubmittedTx {
  label: string;
}

export interface FailTaskResult {
  burns: FailTaskTx[];
  refunds: FailTaskTx[];
  /** Steps already done on the ledger. This call did not repeat them. */
  skipped: string[];
}

/** Money that reached the vault for a task, from one validated transaction. */
export interface VaultDeposit {
  /** task.fund: the price. task.claim: the pledge, paid by accepting the vault's task offer. */
  kind: "task.fund" | "task.claim" | "subtask.fund";
  hash: string;
  /** The account that paid. */
  from: string;
  taskId: string;
  subtaskId?: string | undefined;
  /** The token value that arrived. */
  value: string;
}

/** A validated refund from the vault. */
export interface VaultRefund {
  hash: string;
  to: string;
  taskId: string;
  subtaskId?: string | undefined;
  value: string;
}

/** What the vault's validated history says about funding, payouts, burns, and refunds. */
export interface VaultState {
  burnedNftIds: ReadonlySet<string>;
  /** NFTs the vault bought back in a payout swap. A paid-out task must not also be refunded. */
  paidOutNftIds: ReadonlySet<string>;
  deposits: readonly VaultDeposit[];
  refunds: readonly VaultRefund[];
}

export type FailStep =
  | { type: "burn"; label: string; nftId: string; holderCandidates: string[]; memos: MemoFields }
  | { type: "refund"; label: string; destination: string; amount: string; memos: MemoFields };

export interface FailPlan {
  steps: FailStep[];
  skipped: string[];
  /** What the vault received for the task. Equal to the input amounts, or planFailTask throws. */
  received: FundingReceived;
}

type TokenConfig = Pick<LedgerConfig, "XRPL_TOKEN_CURRENCY" | "XRPL_TOKEN_ISSUER">;

/**
 * Reads the vault's validated history (from listCompleteAccountHistory) into a VaultState.
 * Only amounts in the configured token count. Funding is matched by the memos that the ops write:
 * `task.fund` and `subtask.fund` payments to the vault, and accepts of a token-priced sell offer
 * that the vault made with the task memo (the pledge). Refunds are the vault's `refund` payments.
 */
export function vaultStateFromHistory(
  vaultAddress: string,
  history: readonly LedgerTxRecord[],
  config: TokenConfig,
): VaultState {
  const burnedNftIds = new Set<string>();
  const paidOutNftIds = new Set<string>();
  const deposits: VaultDeposit[] = [];
  const refunds: VaultRefund[] = [];
  const valid = history.filter((tx) => tx.result === "tesSUCCESS");

  // The vault's own token-priced sell offers with a task memo and no sub-task memo: pledge offers.
  const pledgeOffers = new Map<string, { taskId: string; value: string }>();
  for (const tx of valid) {
    if (tx.account !== vaultAddress || !tx.offerId || !tx.memos.task || tx.memos.subtask) continue;
    if (tx.type !== "NFTokenCreateOffer" && tx.type !== "NFTokenMint") continue;
    const value = tokenValueOf(tx.amount, config);
    if (value !== undefined) pledgeOffers.set(tx.offerId, { taskId: tx.memos.task, value });
  }

  for (const tx of valid) {
    if (tx.type === "NFTokenBurn" && tx.nftId) burnedNftIds.add(tx.nftId);
    if (tx.type === "NFTokenAcceptOffer" && tx.account === vaultAddress && tx.nftId) {
      paidOutNftIds.add(tx.nftId);
    }
    if (tx.type === "NFTokenAcceptOffer" && tx.account !== vaultAddress && tx.offerId) {
      const offer = pledgeOffers.get(tx.offerId);
      if (offer) {
        deposits.push({
          kind: "task.claim",
          hash: tx.hash,
          from: tx.account,
          taskId: offer.taskId,
          value: offer.value,
        });
      }
    }
    if (tx.type !== "Payment" || !tx.memos.task) continue;
    const value = tokenValueOf(tx.amount, config);
    if (value === undefined) continue;
    const { task, subtask, action } = tx.memos;
    if (tx.destination === vaultAddress && tx.account !== vaultAddress) {
      if (action === "task.fund" && !subtask) {
        deposits.push({ kind: "task.fund", hash: tx.hash, from: tx.account, taskId: task, value });
      }
      if (action === "subtask.fund" && subtask) {
        deposits.push({
          kind: "subtask.fund",
          hash: tx.hash,
          from: tx.account,
          taskId: task,
          subtaskId: subtask,
          value,
        });
      }
    }
    if (tx.account === vaultAddress && tx.destination && action === "refund") {
      refunds.push({ hash: tx.hash, to: tx.destination, taskId: task, subtaskId: subtask, value });
    }
  }
  return { burnedNftIds, paidOutNftIds, deposits, refunds };
}

const sum = (values: readonly string[]) => (values.length ? addIouValues(...values) : "0");

/** What the vault received for the task, from the history. */
function receivedFor(input: FailTaskInput, state: VaultState): FundingReceived {
  const ours = state.deposits.filter((d) => d.taskId === input.taskId);
  const subtasks: Record<string, string> = {};
  for (const d of ours) {
    if (d.kind !== "subtask.fund" || d.from !== input.agentAddress || !d.subtaskId) continue;
    subtasks[d.subtaskId] = addIouValues(subtasks[d.subtaskId] ?? "0", d.value);
  }
  return {
    price: sum(
      ours
        .filter((d) => d.kind === "task.fund" && d.from === input.requesterAddress)
        .map((d) => d.value),
    ),
    pledge: sum(ours.filter((d) => d.kind === "task.claim").map((d) => d.value)),
    subtasks,
  };
}

/** Compares the caller's amounts with the ledger. Returns one line per difference. */
function fundingProblems(input: FailTaskInput, received: FundingReceived): string[] {
  const problems: string[] = [];
  const check = (what: string, expected: DecimalInput, actual: string) => {
    if (compareIouValues(expected, actual) !== 0) {
      problems.push(`${what}: input ${addIouValues(expected)}, the vault received ${actual}`);
    }
  };
  check(`price from requester ${input.requesterAddress}`, input.price, received.price);
  check("pledge (validated claim of the task offer)", input.pledge, received.pledge);
  const listed = new Set<string>();
  for (const sub of input.subtasks ?? []) {
    listed.add(sub.subtaskId);
    check(
      `sub-task ${sub.subtaskId} from agent`,
      sub.amount,
      received.subtasks[sub.subtaskId] ?? "0",
    );
  }
  for (const [subtaskId, value] of Object.entries(received.subtasks)) {
    if (!listed.has(subtaskId)) {
      problems.push(`sub-task ${subtaskId}: not in the input, the vault received ${value}`);
    }
  }
  return problems;
}

/**
 * Plans the failure flow (PRD 2.3 and the failure row of 5.4) from the on-ledger state.
 * Burns come first, so no holder can redeem after the refunds. Steps already on the ledger are
 * skipped.
 *
 * The refunds come from what the vault received, not from the input: the requester gets the funded
 * price plus the pledge of a validated claim, and the agent gets each funded sub-task amount. The
 * input amounts are expectations. If any differs from the ledger, this throws FundingMismatchError.
 * Throws ALREADY_PAID_OUT if a task or sub-task NFT was already paid out, because then the task did
 * not fail. A refund counts as sent only up to the token value of the validated refunds to that
 * destination with the same task and sub-task memos, so a smaller earlier refund gets topped up.
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
    if (state.paidOutNftIds.has(nft.nftId)) throw alreadyPaidOut(nft.nftId, input.taskId);
  }

  const received = receivedFor(input, state);
  const problems = fundingProblems(input, received);
  if (problems.length > 0) throw new FundingMismatchError(input.taskId, problems, received);

  for (const nft of nfts) {
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

  const requesterRefund = addIouValues(received.price, received.pledge);
  const refunds: { what: string; destination: string; owed: string; memos: MemoFields }[] = [
    {
      what: `(price + pledge) to requester ${input.requesterAddress}`,
      destination: input.requesterAddress,
      owed: requesterRefund,
      memos: { task: input.taskId },
    },
    ...subtasks.map((sub) => ({
      what: `(sub-task ${sub.subtaskId}) to agent ${input.agentAddress}`,
      destination: input.agentAddress as string,
      owed: received.subtasks[sub.subtaskId] ?? "0",
      memos: { task: input.taskId, subtask: sub.subtaskId },
    })),
  ];
  for (const refund of refunds) {
    const sent = sum(
      state.refunds
        .filter(
          (r) =>
            r.to === refund.destination &&
            r.taskId === refund.memos.task &&
            r.subtaskId === refund.memos.subtask,
        )
        .map((r) => r.value),
    );
    if (isZeroIouValue(refund.owed)) {
      skipped.push(`refund ${refund.owed} ${refund.what}: amount is zero`);
    } else if (compareIouValues(sent, refund.owed) >= 0) {
      skipped.push(`refund ${refund.owed} ${refund.what}: already sent`);
    } else {
      const amount = subtractIouValues(refund.owed, sent);
      const label = isZeroIouValue(sent)
        ? `refund ${amount} ${refund.what}`
        : `refund ${amount} of ${refund.owed} ${refund.what}, ${sent} already sent`;
      steps.push({
        type: "refund",
        label,
        destination: refund.destination,
        amount,
        memos: refund.memos,
      });
    }
  }
  return { steps, skipped, received };
}

function alreadyPaidOut(nftId: string, taskId: string): LedgerError {
  return new LedgerError(
    `NFT ${nftId} of task ${taskId} was already paid out. Not failing the task.`,
    "ALREADY_PAID_OUT",
  );
}

/**
 * The failure flow: the vault burns the task NFT and every sub-task NFT, then refunds the requester
 * (funded price + validated pledge) and the agent (funded sub-task money).
 *
 * It reads the vault's complete validated history first, so it refunds only what the vault
 * received, and skips burns and refunds that are already on the ledger. A second call pays nothing.
 * After the burns it reads the history again and plans the refunds from that, so a payout that
 * validated before a burn aborts the call with ALREADY_PAID_OUT and no refund.
 * It runs under the task lock (see taskLockKey), so it never interleaves with a payout of the same
 * task in this process.
 */
export async function failTask(
  input: FailTaskInput,
  ctx?: Partial<OpsContext>,
): Promise<FailTaskResult> {
  const c = await resolveContext(ctx);
  const vault = input.vault.classicAddress;
  const readState = async () =>
    vaultStateFromHistory(vault, await listCompleteAccountHistory(c.client, vault), c.config);

  return withTaskLock(vault, input.taskId, async () => {
    const plan = planFailTask(input, await readState());
    const isRefundLine = (line: string) => line.startsWith("refund ");
    const result: FailTaskResult = {
      burns: [],
      refunds: [],
      skipped: plan.skipped.filter((line) => !isRefundLine(line)),
    };
    const burnedNow = new Set<string>();

    for (const step of plan.steps) {
      if (step.type !== "burn") continue;
      const holder = await findNftHolder(c.client, step.nftId, step.holderCandidates);
      if (!holder) {
        throw new LedgerError(
          `NFT ${step.nftId} is not burned and none of ${step.holderCandidates.join(", ")} holds it.`,
          "NFT_HOLDER_UNKNOWN",
        );
      }
      try {
        const tx = await burnNft(
          {
            vault: input.vault,
            nftId: step.nftId,
            owner: holder,
            taskId: step.memos.task,
            subtaskId: step.memos.subtask,
          },
          c,
        );
        result.burns.push({ ...tx, label: step.label });
        burnedNow.add(step.nftId);
      } catch (error) {
        if (!(error instanceof LedgerError) || error.resultCode !== "tecNO_ENTRY") throw error;
        // The NFT is not where we saw it. It was burned, or it moved: for example a payout swap
        // returned it to the vault. Only the history can tell.
        const fresh = await readState();
        if (fresh.paidOutNftIds.has(step.nftId)) throw alreadyPaidOut(step.nftId, input.taskId);
        if (!fresh.burnedNftIds.has(step.nftId)) throw error;
        result.skipped.push(`${step.label}: already burned`);
      }
    }

    // Plan the refunds again from the history after the burns. A burned NFT can no longer be paid
    // out, so this view is final. Burns this call made count as done even if a lagging server
    // does not show them yet.
    const fresh = await readState();
    const refundPlan = planFailTask(input, {
      ...fresh,
      burnedNftIds: new Set([...fresh.burnedNftIds, ...burnedNow]),
    });
    const leftover = refundPlan.steps.find((s) => s.type === "burn");
    if (leftover) {
      throw new LedgerError(
        `${leftover.label} is still needed after the burns`,
        "NFT_HOLDER_UNKNOWN",
      );
    }
    for (const step of refundPlan.steps) {
      if (step.type !== "refund") continue;
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
      result.refunds.push({ ...tx, label: step.label });
    }
    result.skipped.push(...refundPlan.skipped.filter(isRefundLine));
    return result;
  });
}
