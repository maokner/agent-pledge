// Owner: bundle D (#24). In-process deadline checker every SCHEDULER_INTERVAL_MS: fail tasks past their
// deadline (no claim, or no correct PIN) via services/settlement.ts. Must be idempotent across restarts.
import { and, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { pins, subtasks, tasks } from "../db/schema";
import { deadlineReason, failTask, isFailureInFlight } from "./settlement";

/**
 * One pass: fails every task past its deadline that has no sub-task payout started, and resumes
 * every refund that started but did not finish (e.g. after a restart). Returns the task IDs it failed.
 */
export async function runSchedulerTick(app: FastifyInstance): Promise<string[]> {
  const { db } = app;
  const now = app.clock.now();
  const due = await db
    .select()
    .from(tasks)
    .where(
      or(
        and(
          inArray(tasks.status, ["open", "claimed"]),
          lte(tasks.deadline, now),
          isNull(tasks.refundStartedAt),
          isNull(tasks.paidAt),
          isNull(tasks.payoutStartedAt),
        ),
        and(isNotNull(tasks.refundStartedAt), isNull(tasks.refundedAt)),
      ),
    );
  const failed: string[] = [];
  for (const t of due) {
    if (isFailureInFlight(t.id)) continue;
    const subs = await db.select().from(subtasks).where(eq(subtasks.taskId, t.id));
    // A paid (or paying) sub-task means the agent's redeem is owed: never fail it.
    if (!t.refundStartedAt && subs.some((s) => s.payoutStartedAt)) continue;
    // The correct PIN arrived (its payout may be retrying): the helper did the work, do not fail.
    if (!t.refundStartedAt) {
      const [p] = await db.select().from(pins).where(eq(pins.taskId, t.id));
      if (p?.verifiedAt) continue;
    }
    try {
      await failTask(app, t.id, deadlineReason(t, subs));
      failed.push(t.id);
    } catch (err) {
      app.log.error({ err, taskId: t.id }, "scheduler: failing task failed");
    }
  }
  return failed;
}

interface Running {
  stop: () => void;
}
const running = new WeakMap<object, Running>();

/**
 * Starts the scheduler; returns a stop function. Idempotent per app (server.ts and the onReady hook in
 * routes/admin.ts may both call it).
 */
export function startScheduler(app: FastifyInstance): () => void {
  const key = app.bus;
  const existing = running.get(key);
  if (existing) return existing.stop;
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    runSchedulerTick(app)
      .catch((err) => app.log.error({ err }, "scheduler tick failed"))
      .finally(() => {
        busy = false;
      });
  }, app.config.SCHEDULER_INTERVAL_MS);
  timer.unref?.();
  const handle: Running = {
    stop: () => {
      clearInterval(timer);
      running.delete(key);
    },
  };
  running.set(key, handle);
  return handle.stop;
}
