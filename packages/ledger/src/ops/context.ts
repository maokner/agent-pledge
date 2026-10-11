import type { TxKind } from "@agent-pledge/shared";
import type { Client, SubmittableTransaction, TxResponse, Wallet } from "xrpl";
import { getClient } from "../client.js";
import { loadConfig, type LedgerConfig } from "../config.js";
import { explorerTxUrl } from "../explorer.js";
import { submitTx } from "../submit.js";
import type { SubmittedTx } from "../types.js";
import { readMemos } from "../memo.js";

/** The client and config that every op uses. Both are optional; defaults come from the env. */
export interface OpsContext {
  client: Client;
  config: LedgerConfig;
  /** How often submitTx polls for validation. Tests use a small value. */
  pollIntervalMs?: number;
}

export async function resolveContext(ctx: Partial<OpsContext> = {}): Promise<OpsContext> {
  const config = ctx.config ?? loadConfig();
  const client = ctx.client ?? (await getClient(config));
  return {
    client,
    config,
    ...(ctx.pollIntervalMs === undefined ? {} : { pollIntervalMs: ctx.pollIntervalMs }),
  };
}

/** A wallet or a classic address. */
export type AccountRef = Wallet | string;

export function addressOf(account: AccountRef): string {
  return typeof account === "string" ? account : account.classicAddress;
}

export function toSubmittedTx(config: LedgerConfig, hash: string, kind: TxKind): SubmittedTx {
  return { hash, kind, status: "validated", explorerUrl: explorerTxUrl(config, hash) };
}

/**
 * Submits through the core submitTx, which holds a per-account lock while it signs and submits.
 * The task ID in the memos goes to submitTx too, so every `tx.*` event of the op carries it.
 * Returns the validated response and the SubmittedTx record for the board.
 */
export async function submitOp<T extends SubmittableTransaction>(
  ctx: OpsContext,
  wallet: Wallet,
  tx: T,
  kind: TxKind,
): Promise<{ response: TxResponse<T>; tx: SubmittedTx }> {
  const taskId = readMemos(tx.Memos).task;
  const response = await submitTx(ctx.client, wallet, tx, {
    kind,
    ...(taskId === undefined ? {} : { taskId }),
    ...(ctx.pollIntervalMs === undefined ? {} : { pollIntervalMs: ctx.pollIntervalMs }),
  });
  return { response, tx: toSubmittedTx(ctx.config, response.result.hash, kind) };
}
