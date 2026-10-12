/**
 * The claim page's "On the ledger" panel, as pure functions over the ClaimView:
 * plain words for each transaction and for who holds the NFT, and when the page
 * keeps asking the server for new transactions. No crypto words beyond "NFT"
 * and "XRPL" (docs/design/DIRECTION.md).
 */
import type { ClaimNft, ClaimState, ClaimTx, ClaimView, TxKind } from "@/lib/contract";
import { formatRlusd } from "../format";

/** How often the page reloads the claim while the ledger is still moving. */
export const LEDGER_POLL_MS = 3000;

/**
 * Whether this phone holds (or held) the sub-task: true, false (another phone
 * does), or null when the view cannot tell (for example after the deadline).
 */
export function isMine(view: Pick<ClaimView, "state" | "nft">): boolean | null {
  if (view.nft?.holder === "you") return true;
  if (view.nft?.holder === "helper") return false;
  switch (view.state) {
    case "claimed_by_you":
    case "paying":
    case "paid":
    case "locked":
      return true;
    case "already_claimed":
      return false;
    default:
      return null;
  }
}

export interface TxLabelContext {
  /** From isMine(). */
  mine: boolean | null;
  /** The sub-task's pay, for a payout row without an amount. */
  price: string;
}

/** A plain label for one transaction row, for example "Minted" or "Paid $4.00". */
export function txLabel(
  tx: Pick<ClaimTx, "kind" | "amount">,
  { mine, price }: TxLabelContext,
): string {
  const money = formatRlusd(tx.amount && Number(tx.amount) > 0 ? tx.amount : price);
  switch (tx.kind) {
    case "subtask_claim":
      return mine === true
        ? "Claimed by you"
        : mine === false
          ? "Claimed by another helper"
          : "Claimed by a helper";
    case "helper_payout":
      return mine === false ? `Paid ${money} to another helper` : `Paid ${money}`;
    case "subtask_escrow":
      return `${money} put in the vault`;
    case "agent_refund":
      return `Refunded ${money}`;
    default:
      return TX_LABEL[tx.kind];
  }
}

const TX_LABEL: Record<
  Exclude<TxKind, "subtask_claim" | "helper_payout" | "subtask_escrow" | "agent_refund">,
  string
> = {
  wallet_setup: "Account set up",
  requester_funding: "Requester funded",
  task_escrow: "Requester paid the vault",
  task_nft_mint: "Task NFT minted",
  task_nft_offer: "Task offered to the agent",
  task_claim: "Agent took the task",
  subtask_nft_mint: "Minted",
  subtask_nft_offer: "Offered to anyone",
  helper_payout_offer: "Payout offer",
  agent_payout_offer: "Agent payout offer",
  agent_payout: "Agent paid",
  nft_burn: "Burned",
  requester_refund: "Requester refunded",
};

/** Who holds the NFT, in plain words. */
export function holderText(holder: ClaimNft["holder"], state: ClaimState): string {
  switch (holder) {
    case "you":
      return "Held by you";
    case "helper":
      return "Held by another helper";
    case "burned":
      return "Returned to the vault and burned";
    case "vault":
      if (state === "open") return "Held by the vault until someone claims";
      // After the payout (or a refund) the NFT goes back to the vault, then it is burned.
      if (state === "paid" || state === "paying") return "Back with the vault, about to be burned";
      return "Held by the vault";
  }
}

/** The escrow line: held, paid out, or returned, as the transactions say. */
export function escrowText(view: Pick<ClaimView, "escrow" | "transactions" | "subtask">): string {
  const amount = formatRlusd(view.escrow?.amount ?? view.subtask.price);
  const done = (kind: TxKind) =>
    view.transactions.some((tx) => tx.kind === kind && tx.status === "validated");
  if (done("helper_payout")) return `${amount} paid out by the vault`;
  if (done("agent_refund")) return `${amount} returned by the vault`;
  return `${amount} held by the vault`;
}

/**
 * Whether to keep reloading the claim for new transactions: from the claim
 * until the NFT is burned, and whenever a transaction is still pending.
 * Nobody's claim (open, or another phone's) has nothing new to show.
 */
export function shouldPollLedger(view: Pick<ClaimView, "state" | "nft" | "transactions">): boolean {
  if (view.transactions.some((tx) => tx.status === "pending")) return true;
  switch (view.state) {
    case "claimed_by_you":
    case "paying":
      return true;
    case "paid":
    case "expired":
    case "locked":
      return view.nft !== null && view.nft.holder !== "burned";
    default:
      return false;
  }
}

/** Hashes in `next` that are not in `seen`: the rows that just arrived. */
export function newRows(
  seen: ReadonlySet<string>,
  next: readonly Pick<ClaimTx, "hash">[],
): string[] {
  return next.filter((tx) => !seen.has(tx.hash)).map((tx) => tx.hash);
}
