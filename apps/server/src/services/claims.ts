// Owner: bundle C (#21). Helper claim: helper wallet, accept the open sub-task offer, 409 on AlreadyClaimedError.
import { AlreadyClaimedError, ErrorCode, LedgerError, normalizeCode } from "@agent-pledge/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { issueHelperToken } from "../auth";
import { subtasks, tasks, wallets, type SubtaskRow, type TaskRow } from "../db/schema";
import { HttpError, notFound } from "../lib/http";
import { loadSubtaskView } from "../lib/views";
import type { HelperWalletPool, PooledWallet } from "./wallet-pool";

export const alreadyClaimed = () =>
  new HttpError(409, ErrorCode.alreadyClaimed, "Someone already claimed this task");
export const expired = (msg = "This task has expired") =>
  new HttpError(410, ErrorCode.expired, msg);

/** The sub-task (and its task) behind a claim code; 404 when unknown. */
export async function findByCode(
  app: FastifyInstance,
  rawCode: string,
): Promise<{ code: string; subtask: SubtaskRow; task: TaskRow }> {
  const code = normalizeCode(rawCode);
  if (!code) throw notFound("Unknown claim code");
  const [subtask] = await app.db.select().from(subtasks).where(eq(subtasks.claimCode, code));
  if (!subtask) throw notFound("Unknown claim code");
  const [task] = await app.db.select().from(tasks).where(eq(tasks.id, subtask.taskId));
  if (!task) throw notFound("Unknown claim code");
  return { code, subtask, task };
}

/** True when the sub-task can no longer be worked on (failed, or deadline passed while unpaid). */
export function isExpired(app: FastifyInstance, s: SubtaskRow, t: TaskRow): boolean {
  if (s.status === "failed" || t.status === "failed") return true;
  if (s.status === "done") return false;
  return s.deadline.getTime() <= app.clock.now().getTime();
}

export interface ClaimResult {
  code: string;
  subtaskId: string;
  walletId: string;
  helperToken: string;
}

/**
 * Claims the sub-task for a new helper.
 * 1. DB guard: open + claim_started_at IS NULL -> set claim_started_at (a second claim gets 409).
 * 2. Helper wallet from the pool (or a fresh one).
 * 3. Ledger accept of the open offer. AlreadyClaimedError -> 409; any other failure rolls back -> 502.
 * 4. Store wallet + claim, broadcast subtask.claimed, return a helper token.
 */
export async function claimSubtask(
  app: FastifyInstance,
  pool: HelperWalletPool,
  rawCode: string,
): Promise<ClaimResult> {
  const { code, subtask: s, task: t } = await findByCode(app, rawCode);
  if (isExpired(app, s, t)) throw expired();
  if (s.status !== "open" || s.claimStartedAt) throw alreadyClaimed();
  if (!s.offerId) {
    throw new HttpError(409, ErrorCode.conflict, "This task is not ready to claim yet");
  }

  const now = app.clock.now();
  const guarded = await app.db
    .update(subtasks)
    .set({ claimStartedAt: now, updatedAt: now })
    .where(and(eq(subtasks.id, s.id), eq(subtasks.status, "open"), isNull(subtasks.claimStartedAt)))
    .returning({ id: subtasks.id });
  if (guarded.length === 0) throw alreadyClaimed();

  const rollback = () =>
    app.db
      .update(subtasks)
      .set({ claimStartedAt: null, updatedAt: app.clock.now() })
      .where(and(eq(subtasks.id, s.id), eq(subtasks.status, "open")));

  let wallet: PooledWallet;
  try {
    wallet = await pool.take();
  } catch (err) {
    await rollback();
    throw toBadGateway(err);
  }

  let accept;
  try {
    accept = await app.ledger.port.acceptOffer(wallet.seed, s.offerId, {
      taskId: t.id,
      subtaskId: s.id,
    });
  } catch (err) {
    pool.release(wallet);
    if (err instanceof AlreadyClaimedError) {
      // The offer is gone on the ledger. Keep claim_started_at so later claims also get 409.
      app.log.warn({ subtaskId: s.id }, "sub-task offer already taken on the ledger");
      throw alreadyClaimed();
    }
    await rollback();
    throw toBadGateway(err);
  }

  const at = app.clock.now();
  await app.db
    .update(wallets)
    .set({ taskId: t.id, subtaskId: s.id })
    .where(eq(wallets.id, wallet.walletId));
  await app.db
    .update(subtasks)
    .set({
      status: "claimed",
      helperWalletId: wallet.walletId,
      helperAddress: wallet.address,
      claimTxHash: accept.hash,
      claimedAt: at,
      updatedAt: at,
    })
    .where(eq(subtasks.id, s.id));

  const view = await loadSubtaskView(app.db, app.viewCtx, s.id);
  if (view) app.bus.publish("subtask.claimed", { subtask: view });

  return {
    code,
    subtaskId: s.id,
    walletId: wallet.walletId,
    helperToken: issueHelperToken(app.config, s.id, wallet.walletId, at.getTime()),
  };
}

function toBadGateway(err: unknown): Error {
  if (err instanceof LedgerError) return err; // the app error handler maps it to 502
  const msg = err instanceof Error ? err.message : String(err);
  return new HttpError(502, ErrorCode.ledgerError, `Ledger error: ${msg}`);
}
