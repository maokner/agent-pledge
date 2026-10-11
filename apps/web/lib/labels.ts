/** Plain-English labels for contract enums, in the PRD's words. */
import type { ClaimState, TxKind, TxStatus, WorkStatus } from "@agent-pledge/shared";

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  open: "Open",
  claimed: "Claimed",
  done: "Done",
  failed: "Failed",
};

export const TX_STATUS_LABEL: Record<TxStatus, string> = {
  pending: "Pending",
  validated: "Validated",
  failed: "Failed",
};

export const TX_KIND_LABEL: Record<TxKind, string> = {
  task_escrow: "Requester pays the vault",
  task_nft_mint: "Vault makes the task NFT",
  task_nft_offer: "Vault offers the task to the agent",
  task_claim: "Agent claims the task and pays the pledge",
  subtask_escrow: "Agent pays the vault for the sub-task",
  subtask_nft_mint: "Vault makes the sub-task NFT",
  subtask_nft_offer: "Vault offers the sub-task to helpers",
  subtask_claim: "Helper claims the sub-task",
  helper_payout_offer: "Helper offers the NFT back for the payout",
  helper_payout: "Vault pays the helper",
  agent_payout_offer: "Agent offers the NFT back for the payout",
  agent_payout: "Vault pays the agent",
  nft_burn: "Vault burns the NFT",
  requester_refund: "Vault refunds the requester, plus the pledge",
  agent_refund: "Vault returns the sub-task money to the agent",
};

export const CLAIM_STATE_LABEL: Record<ClaimState, string> = {
  open: "Open",
  claimed_by_you: "Claimed by you",
  already_claimed: "Already claimed",
  expired: "Expired",
  locked: "Locked",
  paying: "Paying",
  paid: "Paid",
};
