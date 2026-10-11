// Owner: bundle D (#23, #24). Helper payout (redeem offer + vault accept + burn), task.redeemable to the
// local agent, and the failure flow (failTask). The agent's own payout runs in POST /agent/tasks/:id/redeem
// (bundle B): the server never holds the agent's seed, so it only notifies the agent here.
// Idempotency: claim the *_started_at marker with a conditional UPDATE ... WHERE x IS NULL before ledger calls.
import { ErrorCode, fromCents, type Money, type TaskView } from "@agent-pledge/shared";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { subtasks, tasks, wallets, type SubtaskRow, type TaskRow } from "../db/schema";
import { HttpError, notFound } from "../lib/http";
import { decryptSeed } from "../lib/seed-crypto";
import { loadSubtaskView, loadTaskView } from "../lib/views";

export interface HelperPayout {
  amount: Money;
  tx_hash: string;
  explorer_url: string;
}

const conflict = (msg: string) => new HttpError(409, ErrorCode.conflict, msg);
const expired = (msg: string) => new HttpError(410, ErrorCode.expired, msg);

/** In-process de-duplication: concurrent calls for the same key share one run. */
const inflightPayouts = new Map<string, Promise<HelperPayout>>();
const inflightFailures = new Map<string, Promise<TaskView>>();

export function isFailureInFlight(taskId: string): boolean {
  return inflightFailures.has(taskId);
}

async function getTask(app: FastifyInstance, id: string): Promise<TaskRow | undefined> {
  const [t] = await app.db.select().from(tasks).where(eq(tasks.id, id));
  return t;
}
async function getSubtask(app: FastifyInstance, id: string): Promise<SubtaskRow | undefined> {
  const [s] = await app.db.select().from(subtasks).where(eq(subtasks.id, id));
  return s;
}

async function paidResult(app: FastifyInstance, s: SubtaskRow): Promise<HelperPayout> {
  const hash = s.payoutTxHash!;
  return {
    amount: fromCents(s.priceCents),
    tx_hash: hash,
    explorer_url: app.ledger.port.explorerTxUrl(hash),
  };
}

// ---------- Helper payout (#23) ----------

/**
 * Pays the helper of a sub-task whose PIN was verified: helper redeem offer (server-held helper seed),
 * vault accepts it (NFT back, helper paid), vault burns the NFT. Marks the sub-task done and paid,
 * broadcasts subtask.paid, and sends task.redeemable to the local agent.
 * Idempotent: a second call (concurrent or later) pays nothing and returns the same result.
 */
export function payHelper(app: FastifyInstance, subtaskId: string): Promise<HelperPayout> {
  const running = inflightPayouts.get(subtaskId);
  if (running) return running;
  const run = payHelperOnce(app, subtaskId).finally(() => inflightPayouts.delete(subtaskId));
  inflightPayouts.set(subtaskId, run);
  return run;
}

async function payHelperOnce(app: FastifyInstance, subtaskId: string): Promise<HelperPayout> {
  const { db, clock } = app;
  const s0 = await getSubtask(app, subtaskId);
  if (!s0) throw notFound("Sub-task not found");
  if (s0.paidAt && s0.payoutTxHash) return paidResult(app, s0);

  // Claim the payout marker, and lock the task row so the failure flow cannot start at the same time.
  const now = clock.now();
  const claimed = await db.transaction(async (tx) => {
    const lockedTask = await tx
      .update(tasks)
      .set({ updatedAt: now })
      .where(and(eq(tasks.id, s0.taskId), isNull(tasks.refundStartedAt)))
      .returning({ id: tasks.id });
    if (lockedTask.length === 0) return "failed" as const;
    const rows = await tx
      .update(subtasks)
      .set({ payoutStartedAt: now, updatedAt: now })
      .where(and(eq(subtasks.id, subtaskId), isNull(subtasks.payoutStartedAt)))
      .returning({ id: subtasks.id });
    return rows.length ? ("claimed" as const) : ("taken" as const);
  });
  if (claimed === "failed") throw expired("The task has failed");
  // "taken" without an in-flight run in this process means a previous run crashed: resume it.

  try {
    return await runHelperPayout(app, subtaskId);
  } catch (err) {
    // Nothing paid yet: release the marker so the helper can try again.
    await db
      .update(subtasks)
      .set({ payoutStartedAt: null })
      .where(and(eq(subtasks.id, subtaskId), isNull(subtasks.payoutTxHash)));
    throw err;
  }
}

async function runHelperPayout(app: FastifyInstance, subtaskId: string): Promise<HelperPayout> {
  const { db, clock, config } = app;
  const ledger = app.ledger.port;
  let s = (await getSubtask(app, subtaskId))!;
  const ctx = { taskId: s.taskId, subtaskId };
  const amount = fromCents(s.priceCents);

  if (!s.payoutTxHash) {
    if (!s.nftId || !s.helperWalletId) throw conflict("The sub-task has no claimed NFT");
    const [w] = await db.select().from(wallets).where(eq(wallets.id, s.helperWalletId));
    if (!w?.encryptedSeed) throw conflict("The helper wallet has no seed");
    const helperSeed = decryptSeed(w.encryptedSeed, config.SEED_ENCRYPTION_KEY);
    let offerId = s.helperRedeemOfferId;
    if (!offerId) {
      const offer = await ledger.createRedeemOffer(helperSeed, s.nftId, amount, ctx);
      offerId = offer.offerId;
      await db
        .update(subtasks)
        .set({ helperRedeemOfferId: offerId, updatedAt: clock.now() })
        .where(eq(subtasks.id, subtaskId));
    }
    const payout = await ledger.acceptRedeemOffer(offerId, ctx);
    const at = clock.now();
    await db
      .update(subtasks)
      .set({
        payoutTxHash: payout.hash,
        paidAt: at,
        status: "done",
        doneAt: at,
        updatedAt: at,
      })
      .where(eq(subtasks.id, subtaskId));
  }

  s = (await getSubtask(app, subtaskId))!;
  if (!s.burnedAt && s.nftId) {
    try {
      await ledger.burn(s.nftId, ctx);
      await db.update(subtasks).set({ burnedAt: clock.now() }).where(eq(subtasks.id, subtaskId));
    } catch (err) {
      // The helper is paid; a failed burn only leaves the NFT open. Log it and carry on.
      app.log.error({ err, subtaskId }, "sub-task NFT burn failed");
    }
  }

  await app.ledgerBridge.idle();
  const result = await paidResult(app, s);
  const view = await loadSubtaskView(db, app.viewCtx, subtaskId);
  if (view) app.bus.publish("subtask.paid", { subtask: view, ...result });
  await notifyRedeemable(app, s.taskId, subtaskId);
  return result;
}

/** Sends task.redeemable to the local agent (and records the first time it was sent). */
export async function notifyRedeemable(app: FastifyInstance, taskId: string, subtaskId: string) {
  const t = await getTask(app, taskId);
  if (!t || t.paidAt) return;
  await app.db
    .update(tasks)
    .set({ redeemNotifiedAt: app.clock.now() })
    .where(and(eq(tasks.id, taskId), isNull(tasks.redeemNotifiedAt)));
  app.agentChannel.send({
    type: "task.redeemable",
    task_id: taskId,
    subtask_id: subtaskId,
    nft_id: t.nftId,
    amount: fromCents(t.priceCents + t.pledgeCents),
    vault_address: app.ledger.vaultAddress,
  });
}

// ---------- Failure flow (#24) ----------

/**
 * PRD 2.3 failure: burn the NFTs, refund the requester (price, plus the pledge when the agent claimed)
 * and the agent (the money of every funded, unpaid sub-task), mark the task and sub-tasks failed,
 * broadcast task.failed. Idempotent: refund_started_at is claimed once; a started but unfinished
 * refund is resumed (LedgerPort.failTask is idempotent per task), never refunded twice.
 * Throws 409 when a sub-task payout has started (the agent's redeem is owed) or the task is done.
 */
export function failTask(app: FastifyInstance, taskId: string, reason: string): Promise<TaskView> {
  const running = inflightFailures.get(taskId);
  if (running) return running;
  const run = failTaskOnce(app, taskId, reason).finally(() => inflightFailures.delete(taskId));
  inflightFailures.set(taskId, run);
  return run;
}

async function failTaskOnce(app: FastifyInstance, taskId: string, reason: string) {
  const { db, clock } = app;
  const t0 = await getTask(app, taskId);
  if (!t0) throw notFound("Task not found");
  if (t0.refundedAt) return (await loadTaskView(db, app.viewCtx, taskId))!;

  if (!t0.refundStartedAt) {
    const now = clock.now();
    const payoutStarted = sql`exists (select 1 from ${subtasks} where ${subtasks.taskId} = ${tasks.id} and ${subtasks.payoutStartedAt} is not null)`;
    const rows = await db
      .update(tasks)
      .set({
        refundStartedAt: now,
        status: "failed",
        failedAt: now,
        failReason: reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.id, taskId),
          isNull(tasks.refundStartedAt),
          isNull(tasks.paidAt),
          isNull(tasks.payoutStartedAt),
          inArray(tasks.status, ["open", "claimed"]),
          sql`not ${payoutStarted}`,
        ),
      )
      .returning({ id: tasks.id });
    if (rows.length === 0) {
      const t1 = await getTask(app, taskId);
      if (!t1?.refundStartedAt) {
        throw conflict(
          t1?.status === "done" || t1?.paidAt
            ? "The task is already done"
            : "A helper was already paid; the agent's payout is owed",
        );
      }
      // Someone else started the refund: fall through and resume it.
    }
    await db
      .update(subtasks)
      .set({ status: "failed", failedAt: now, failReason: "Task failed", updatedAt: now })
      .where(and(eq(subtasks.taskId, taskId), ne(subtasks.status, "done")));
  }

  const t = (await getTask(app, taskId))!;
  const subs = await db.select().from(subtasks).where(eq(subtasks.taskId, taskId));
  const agentClaimed = !!(t.claimedAt || t.claimTxHash);
  const funded = subs.filter((s) => (s.fundingTxHash || s.nftId) && !s.paidAt);
  const withNft = subs.filter((s) => s.nftId && !s.burnedAt);
  const requesterCents = t.requesterAddress ? t.priceCents + (agentClaimed ? t.pledgeCents : 0) : 0;
  const agentCents = funded.reduce((n, s) => n + s.priceCents, 0);

  try {
    await app.ledger.port.failTask({
      taskId,
      taskNftId: t.nftId,
      subtaskNftIds: withNft.map((s) => s.nftId!),
      subtaskIds: withNft.map((s) => s.id),
      requesterAddress: t.requesterAddress ?? "",
      refundToRequester: fromCents(requesterCents),
      agentAddress: t.agentAddress ?? app.ledger.agentAddress,
      refundToAgent: fromCents(agentCents),
    });
  } catch (err) {
    // refund_started_at stays set: the scheduler resumes it.
    app.log.error({ err, taskId }, "failure refund failed; will retry");
    throw err;
  }

  const at = clock.now();
  await db
    .update(tasks)
    .set({ refundedAt: at, status: "failed", updatedAt: at })
    .where(eq(tasks.id, taskId));
  if (withNft.length) {
    await db
      .update(subtasks)
      .set({ burnedAt: at })
      .where(
        and(eq(subtasks.taskId, taskId), isNotNull(subtasks.nftId), isNull(subtasks.burnedAt)),
      );
  }
  await app.ledgerBridge.idle();
  const view = (await loadTaskView(db, app.viewCtx, taskId))!;
  app.bus.publish("task.failed", { task: view, reason: t.failReason ?? reason });
  return view;
}

/** Why a task past its deadline failed, for the board. */
export function deadlineReason(t: TaskRow, subs: SubtaskRow[]): string {
  if (!t.claimedAt && !t.claimTxHash) return "The agent never claimed the task";
  if (!subs.some((s) => s.claimedAt || s.helperAddress))
    return "No helper claimed the sub-task in time";
  return "No correct PIN before the time limit";
}
