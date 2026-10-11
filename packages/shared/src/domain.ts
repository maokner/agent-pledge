import { z } from "zod";

export const TaskStatus = z.enum(["open", "claimed", "done", "failed"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const SubtaskStatus = z.enum(["open", "claimed", "done", "failed"]);
export type SubtaskStatus = z.infer<typeof SubtaskStatus>;

export const WalletRole = z.enum(["requester", "helper", "agent", "vault"]);
export type WalletRole = z.infer<typeof WalletRole>;

export const TxStatus = z.enum(["pending", "validated", "failed"]);
export type TxStatus = z.infer<typeof TxStatus>;

/**
 * Every ledger step in PRD 5.4, plus requester funding and refunds.
 * Who signs is in brackets.
 */
export const TxKind = z.enum([
  "wallet_setup", // faucet + RLUSD trust line for a new requester/helper wallet [server]
  "requester_funding", // Payment treasury -> requester (demo funding) [server]
  "task_funding", // Payment requester -> vault, task price [server, requester seed]
  "task_nft_mint", // NFTokenMint task NFT [vault]
  "task_offer", // NFTokenCreateOffer sell, Amount = pledge, Destination = agent [vault]
  "task_claim", // NFTokenAcceptOffer, pays the pledge [local agent]
  "subtask_funding", // Payment agent -> vault, sub-task price [local agent]
  "subtask_nft_mint", // NFTokenMint sub-task NFT [vault]
  "subtask_offer", // NFTokenCreateOffer sell, Amount = 0, no Destination [vault]
  "subtask_claim", // NFTokenAcceptOffer by the helper wallet [server, helper seed]
  "helper_redeem_offer", // NFTokenCreateOffer sell to vault, Amount = sub-task price [server, helper seed]
  "helper_payout", // NFTokenAcceptOffer by the vault: NFT back, helper paid [vault]
  "agent_redeem_offer", // NFTokenCreateOffer sell to vault, Amount = price + pledge [local agent]
  "agent_payout", // NFTokenAcceptOffer by the vault: NFT back, agent paid [vault]
  "task_nft_burn", // NFTokenBurn task NFT [vault]
  "subtask_nft_burn", // NFTokenBurn sub-task NFT [vault]
  "refund_requester", // Payment vault -> requester, price + pledge (failure) [vault]
  "refund_agent", // Payment vault -> agent, sub-task money (failure) [vault]
]);
export type TxKind = z.infer<typeof TxKind>;

export const Currency = z.enum(["RLUSD", "XRP"]);
export type Currency = z.infer<typeof Currency>;

export const MediaKind = z.enum(["photo", "yikyak_screenshot"]);
export type MediaKind = z.infer<typeof MediaKind>;

export const AgentLogLevel = z.enum(["info", "decision", "error"]);
export type AgentLogLevel = z.infer<typeof AgentLogLevel>;

export const PIN_MAX_ATTEMPTS = 3;
export const PIN_REGEX = /^\d{4}$/;

/** ISO 8601 timestamp string, e.g. "2026-10-11T18:03:00.000Z". */
export const IsoTime = z.string();
export type IsoTime = z.infer<typeof IsoTime>;
