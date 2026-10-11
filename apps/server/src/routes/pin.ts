// Owner: bundle D (#23). POST /claim/:code/pin. Needs the helper token (requireHelper from auth.ts).
// Wrong PIN -> 422 wrong_pin + pin.failed; third wrong -> 423 pin_locked + pin.locked.
// Correct PIN -> services/settlement.ts pays the helper, then notifies the agent (task.redeemable).
import {
  ErrorCode,
  normalizeCode,
  PIN_MAX_ATTEMPTS,
  PinRequest,
  type PinResponse,
} from "@agent-pledge/shared";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { requireHelper } from "../auth";
import { pins, subtasks, tasks } from "../db/schema";
import { HttpError, notFound, parseOrThrow } from "../lib/http";
import { verifyPin } from "../lib/pin";
import { loadClaimView } from "../lib/views";
import { payHelper } from "../services/settlement";

const pinLocked = (attempts: number) =>
  new HttpError(423, ErrorCode.pinLocked, "Too many wrong PINs. This sub-task is locked.", {
    attempts,
    attempts_left: 0,
  });

const pinRoutes: FastifyPluginAsync = async (app) => {
  app.post("/claim/:code/pin", async (req): Promise<PinResponse> => {
    const { db, clock } = app;
    const code = normalizeCode((req.params as { code: string }).code);
    if (!code) throw notFound("Unknown claim code");
    const [s] = await db.select().from(subtasks).where(eq(subtasks.claimCode, code));
    if (!s) throw notFound("Unknown claim code");
    requireHelper(req, code, s.id);
    const { pin } = parseOrThrow(PinRequest, req.body);

    const [t] = await db.select().from(tasks).where(eq(tasks.id, s.taskId));
    const [p] = await db.select().from(pins).where(eq(pins.taskId, s.taskId));
    if (!t || !p) throw notFound("Task not found");

    const respond = async (): Promise<PinResponse> => {
      const payout = await payHelper(app, s.id);
      const claim = (await loadClaimView(db, app.viewCtx, code, true))!;
      return { claim, payout };
    };

    // Already verified for this sub-task: a repeat of the correct PIN returns the same payout.
    if (p.verifiedAt && p.verifiedSubtaskId === s.id) {
      if (!verifyPin(pin, p.pinHash))
        throw new HttpError(409, ErrorCode.conflict, "The PIN was already accepted");
      return respond();
    }

    if (t.refundStartedAt || t.status === "failed" || s.status === "failed")
      throw new HttpError(410, ErrorCode.expired, "This task has failed");
    if (clock.now().getTime() > t.deadline.getTime())
      throw new HttpError(410, ErrorCode.expired, "The time limit has passed");
    if (p.verifiedAt)
      throw new HttpError(409, ErrorCode.conflict, "Another helper already entered the PIN");
    if (s.status !== "claimed")
      throw new HttpError(409, ErrorCode.conflict, "This sub-task is not claimed");
    if (p.locked) throw pinLocked(p.attempts);

    const now = clock.now();
    if (!verifyPin(pin, p.pinHash)) {
      // Atomic increment; the third wrong attempt locks.
      const [row] = await db
        .update(pins)
        .set({
          attempts: sql`${pins.attempts} + 1`,
          locked: sql`${pins.attempts} + 1 >= ${PIN_MAX_ATTEMPTS}`,
          lockedAt: sql`case when ${pins.attempts} + 1 >= ${PIN_MAX_ATTEMPTS} then ${now.toISOString()}::timestamptz else null end`,
        })
        .where(
          and(
            eq(pins.taskId, t.id),
            eq(pins.locked, false),
            isNull(pins.verifiedAt),
            lt(pins.attempts, PIN_MAX_ATTEMPTS),
          ),
        )
        .returning({ attempts: pins.attempts, locked: pins.locked });
      if (!row) {
        const [cur] = await db.select().from(pins).where(eq(pins.taskId, t.id));
        throw pinLocked(cur?.attempts ?? PIN_MAX_ATTEMPTS);
      }
      if (row.locked) {
        app.bus.publish("pin.locked", {
          task_id: t.id,
          subtask_id: s.id,
          attempts: row.attempts,
        });
        throw pinLocked(row.attempts);
      }
      const attemptsLeft = PIN_MAX_ATTEMPTS - row.attempts;
      app.bus.publish("pin.failed", {
        task_id: t.id,
        subtask_id: s.id,
        attempts: row.attempts,
        attempts_left: attemptsLeft,
      });
      throw new HttpError(
        422,
        ErrorCode.wrongPin,
        `Wrong PIN. ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left.`,
        { attempts: row.attempts, attempts_left: attemptsLeft },
      );
    }

    // Correct PIN: record it once (bound to this sub-task), unless locked meanwhile.
    const verified = await db
      .update(pins)
      .set({ verifiedAt: now, verifiedSubtaskId: s.id })
      .where(
        and(
          eq(pins.taskId, t.id),
          eq(pins.locked, false),
          or(isNull(pins.verifiedAt), eq(pins.verifiedSubtaskId, s.id)),
        ),
      )
      .returning({ taskId: pins.taskId });
    if (verified.length === 0) {
      const [cur] = await db.select().from(pins).where(eq(pins.taskId, t.id));
      if (cur?.locked) throw pinLocked(cur.attempts);
      throw new HttpError(409, ErrorCode.conflict, "Another helper already entered the PIN");
    }
    return respond();
  });
};

export default pinRoutes;
