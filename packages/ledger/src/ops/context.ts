import type { TxKind } from "@agent-pledge/shared";
import type { Client, SubmittableTransaction, TxResponse, Wallet } from "xrpl";
import { getClient } from "../client.js";
import { loadConfig, type LedgerConfig } from "../config.js";
import { explorerTxUrl } from "../explorer.js";
import { submitTx } from "../submit.js";
import type { SubmittedTx } from "../types.js";
import { runExclusive } from "./queue.js";

/** The client and config that every op uses. Both are optional; defaults come from the env. */
export interface OpsContext {
  client: Client;
  config: LedgerConfig;
}

export async function resolveContext(ctx: Partial<OpsContext> = {}): Promise<OpsContext> {
  const config = ctx.config ?? loadConfig();
  const client = ctx.client ?? (await getClient(config));
  return { client, config };
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
 * Submits through the core submitTx, one transaction at a time per signing account.
 * Returns the validated response and the SubmittedTx record for the board.
 */
export async function submitOp<T extends SubmittableTransaction>(
  ctx: OpsContext,
  wallet: Wallet,
  tx: T,
  kind: TxKind,
): Promise<{ response: TxResponse<T>; tx: SubmittedTx }> {
  const response = await runExclusive(wallet.classicAddress, () =>
    submitTx(ctx.client, wallet, tx),
  );
  return { response, tx: toSubmittedTx(ctx.config, response.result.hash, kind) };
}
