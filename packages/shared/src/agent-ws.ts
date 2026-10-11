import { z } from "zod";
import { IsoTime, TaskStatus } from "./domain";
import { Money } from "./money";

/**
 * Local agent WebSocket (/ws/agent). Auth: `Authorization: Bearer <AGENT_TOKEN>` on the upgrade
 * request (or `?token=<AGENT_TOKEN>` when the client cannot set headers).
 */

/** The full task as the local agent needs it. */
export const AgentTask = z.object({
  id: z.string(),
  description: z.string(),
  place: z.string(),
  time_limit_minutes: z.number().int(),
  deadline: IsoTime,
  price: Money,
  pledge: Money,
  status: TaskStatus,
  /** The task NFT and the vault's sell offer reserved for the agent (Amount = pledge). */
  nft_id: z.string().nullable(),
  offer_id: z.string().nullable(),
  vault_address: z.string().nullable(),
  board_url: z.string(),
  created_at: IsoTime,
});
export type AgentTask = z.infer<typeof AgentTask>;

// ---------- server -> agent ----------

/** A new task. Resent on every (re)connect until the agent acks it. */
export const TaskNewMessage = z.object({ type: z.literal("task.new"), task: AgentTask });
export type TaskNewMessage = z.infer<typeof TaskNewMessage>;

/**
 * The helper entered the correct PIN and was paid. The agent should now create its redeem offer
 * (sell the task NFT to the vault for `amount` = price + pledge) and call POST /agent/tasks/:id/redeem.
 * Resent on every (re)connect while the task is redeemable and not yet paid.
 */
export const TaskRedeemableMessage = z.object({
  type: z.literal("task.redeemable"),
  task_id: z.string(),
  subtask_id: z.string(),
  nft_id: z.string().nullable(),
  amount: Money,
  vault_address: z.string().nullable(),
});
export type TaskRedeemableMessage = z.infer<typeof TaskRedeemableMessage>;

export const AgentServerMessage = z.discriminatedUnion("type", [
  TaskNewMessage,
  TaskRedeemableMessage,
]);
export type AgentServerMessage = z.infer<typeof AgentServerMessage>;

// ---------- agent -> server ----------

export const AgentHelloMessage = z.object({
  type: z.literal("hello"),
  agent_address: z.string().optional(),
  version: z.string().optional(),
});
export const AgentAckMessage = z.object({ type: z.literal("ack"), task_id: z.string() });

export const AgentClientMessage = z.discriminatedUnion("type", [
  AgentHelloMessage,
  AgentAckMessage,
]);
export type AgentClientMessage = z.infer<typeof AgentClientMessage>;
