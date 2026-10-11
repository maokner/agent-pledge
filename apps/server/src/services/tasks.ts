// Owner: bundle B (#19, #20, #25). Task creation (create_task), agent claim, sub-task creation,
// agent redeem, task.new push to app.agentChannel, board events.
import {
  ErrorCode,
  fromCents,
  newId,
  toCents,
  type AgentLogEntry,
  type AgentLogRequest,
  type ClaimTaskRequest,
  type CreateSubtaskRequest,
  type CreateSubtaskResponse,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type NftUriData,
  type RedeemTaskRequest,
  type RedeemTaskResponse,
  type TaskRedeemableMessage,
  type TaskStatusResponse,
  type TaskView,
} from "@agent-pledge/shared";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { agentLog, pins, subtasks, tasks, wallets, type TaskRow } from "../db/schema";
import { uniqueBoardCode, uniqueClaimCode } from "../lib/codes";
import { badRequest, HttpError, notFound } from "../lib/http";
import { generatePin, hashPin } from "../lib/pin";
import { encryptSeed } from "../lib/seed-crypto";
import { boardUrl, claimUrl, nftUri } from "../lib/urls";
import { agentLogRowToView, loadSubtaskView, loadTaskView, taskRowToAgentTask } from "../lib/views";

const conflict = (msg: string) => new HttpError(409, ErrorCode.conflict, msg);
const expired = (msg: string) => new HttpError(410, ErrorCode.expired, msg);

// ---------- background work tracking (tests and shutdown wait on it) ----------

// Keyed by the bus: plugin instances are encapsulated copies of the app, the bus is shared.
const pendingSetups = new WeakMap<object, Set<Promise<void>>>();

function track(app: FastifyInstance, p: Promise<void>) {
  let set = pendingSetups.get(app.bus);
  if (!set) {
    set = new Set();
    pendingSetups.set(app.bus, set);
  }
  set.add(p);
  void p.finally(() => set.delete(p));
}

/** Resolves when every background task setup started so far has finished (and the bridge is idle). */
export async function tasksIdle(app: FastifyInstance): Promise<void> {
  const set = pendingSetups.get(app.bus);
  while (set && set.size > 0) await Promise.allSettled([...set]);
  await app.ledgerBridge.idle();
}

// ---------- helpers ----------

async function getTaskRow(app: FastifyInstance, id: string): Promise<TaskRow> {
  const [t] = await app.db.select().from(tasks).where(eq(tasks.id, id));
  if (!t) throw notFound(`Unknown task ${id}`);
  return t;
}

async function taskView(app: FastifyInstance, id: string): Promise<TaskView> {
  const v = await loadTaskView(app.db, app.viewCtx, id);
  if (!v) throw notFound(`Unknown task ${id}`);
  return v;
}

function assertLive(app: FastifyInstance, t: TaskRow) {
  if (t.status === "failed") throw expired(`Task failed: ${t.failReason ?? "unknown reason"}`);
  if (t.status !== "done" && t.deadline.getTime() <= app.clock.now().getTime())
    throw expired("The task deadline has passed");
}

const SEAT_HOLD =
  /\b(seats?|chairs?|tables?|desks?|booths?|spots?|places? in line|save (me )?a place|hold (me )?a place)\b/i;

/** The PRD 6 base demo rule, applied only when SEAT_HOLDS_ONLY is set. */
export function isSeatHold(description: string): boolean {
  return SEAT_HOLD.test(description);
}

function parsePriceCents(input: number | string): number {
  let cents: number;
  try {
    cents = toCents(input);
  } catch {
    throw badRequest(`Invalid price: ${String(input)}`);
  }
  if (cents <= 0) throw badRequest("Price must be greater than 0");
  return cents;
}

// ---------- create_task (#19) ----------

/**
 * Inserts the task and its PIN, broadcasts task.created, and returns at once (the voice agent is
 * waiting). The ledger steps run in the background; task.new goes to the agent after the offer exists.
 */
/** How long a call_id keeps returning its first task. Longer than any call, shorter than a demo day. */
const CALL_DEDUPE_MS = 30 * 60_000;
const callResults = new WeakMap<
  object,
  Map<string, { at: number; result: Promise<CreateTaskResponse> }>
>();

/**
 * POST /tools/create_task. ElevenLabs can retry a tool call (for example after a timeout), so a
 * repeated call_id returns the first call's response, with the same task and PIN, instead of
 * making a second task. Kept in memory: a server restart forgets it, which only matters for a
 * retry that spans the restart.
 */
export async function createTask(
  app: FastifyInstance,
  input: CreateTaskRequest,
): Promise<CreateTaskResponse> {
  const callId = input.call_id?.trim();
  if (!callId) return createTaskOnce(app, input);

  const byCall = callResults.get(app) ?? new Map();
  callResults.set(app, byCall);
  const now = Date.now();
  for (const [id, entry] of byCall) if (now - entry.at > CALL_DEDUPE_MS) byCall.delete(id);

  const seen = byCall.get(callId);
  if (seen) return seen.result;
  const result = createTaskOnce(app, input);
  byCall.set(callId, { at: now, result });
  // A failed call (for example not a seat hold) may be retried with fixed values.
  result.catch(() => byCall.delete(callId));
  return result;
}

async function createTaskOnce(
  app: FastifyInstance,
  input: CreateTaskRequest,
): Promise<CreateTaskResponse> {
  if (app.config.SEAT_HOLDS_ONLY && !isSeatHold(input.description)) {
    throw new HttpError(
      422,
      ErrorCode.notSeatHold,
      "Right now I can only save seats. This task is not a seat hold.",
    );
  }
  const priceCents = parsePriceCents(input.price_usd);
  const { db, config, clock } = app;
  const now = clock.now();
  const taskId = newId("task");
  const pin = generatePin();
  const deadline = new Date(now.getTime() + input.time_limit_minutes * 60_000);

  await db.insert(tasks).values({
    id: taskId,
    boardCode: await uniqueBoardCode(db),
    description: input.description,
    place: input.place,
    timeLimitMinutes: input.time_limit_minutes,
    deadline,
    priceCents,
    pledgeCents: toCents(config.PLEDGE_AMOUNT),
    status: "open",
    callerPhone: input.caller_phone ?? null,
    agentAddress: app.ledger.agentAddress,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(pins).values({ taskId, pinHash: hashPin(pin), createdAt: now });

  app.bus.publish("task.created", { task: await taskView(app, taskId) });
  track(app, setupTaskOnLedger(app, taskId));

  return {
    task_id: taskId,
    pin,
    board_url: boardUrl(config, taskId),
    status: "open",
    price: fromCents(priceCents),
    deadline: deadline.toISOString(),
  };
}

/** Requester wallet, funding, task NFT, offer to the agent; then task.new. Marks the task failed on error. */
async function setupTaskOnLedger(app: FastifyInstance, taskId: string): Promise<void> {
  const { db, config } = app;
  const ledger = app.ledger.port;
  try {
    const t = await getTaskRow(app, taskId);
    const price = fromCents(t.priceCents);
    const w = await ledger.createWallet("requester");
    const walletId = newId("wal");
    await db.insert(wallets).values({
      id: walletId,
      role: "requester",
      address: w.address,
      encryptedSeed: encryptSeed(w.seed, config.SEED_ENCRYPTION_KEY),
      taskId,
    });
    await db
      .update(tasks)
      .set({ requesterWalletId: walletId, requesterAddress: w.address, updatedAt: app.clock.now() })
      .where(eq(tasks.id, taskId));

    await ledger.fundRequester(w.address, config.REQUESTER_FUNDING_AMOUNT || price, { taskId });
    await ledger.fundTask(w.seed, taskId, price);
    const mint = await ledger.mintTaskNft(taskId, nftUri(config, taskId));
    await db
      .update(tasks)
      .set({ nftId: mint.nftId, updatedAt: app.clock.now() })
      .where(eq(tasks.id, taskId));
    const offer = await ledger.offerTaskToAgent(
      mint.nftId,
      fromCents(t.pledgeCents),
      app.ledger.agentAddress,
      taskId,
    );
    const [row] = await db
      .update(tasks)
      .set({ offerId: offer.offerId, updatedAt: app.clock.now() })
      .where(eq(tasks.id, taskId))
      .returning();
    if (!row || row.status !== "open") return; // failed or expired meanwhile

    await app.ledgerBridge.idle();
    // Clients upsert by ID: re-send the task with its NFT, offer, and requester address.
    app.bus.publish("task.created", { task: await taskView(app, taskId) });
    app.agentChannel.send({ type: "task.new", task: taskRowToAgentTask(app.viewCtx, row) });
  } catch (err) {
    app.log.error({ err, taskId }, "task ledger setup failed");
    await failTaskSetup(app, taskId, `Ledger setup failed: ${(err as Error).message}`).catch((e) =>
      app.log.error({ err: e, taskId }, "could not mark task failed"),
    );
  }
}

async function failTaskSetup(app: FastifyInstance, taskId: string, reason: string) {
  const now = app.clock.now();
  const [row] = await app.db
    .update(tasks)
    .set({ status: "failed", failedAt: now, failReason: reason, updatedAt: now })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, "open")))
    .returning();
  if (!row) return;
  await app.ledgerBridge.idle();
  app.bus.publish("task.failed", { task: await taskView(app, taskId), reason });
}

/** GET /tools/task_status/:taskId */
export async function taskStatus(
  app: FastifyInstance,
  taskId: string,
): Promise<TaskStatusResponse> {
  const t = await getTaskRow(app, taskId);
  const subs = await app.db
    .select({ note: subtasks.helperNote })
    .from(subtasks)
    .where(and(eq(subtasks.taskId, taskId), isNotNull(subtasks.helperNote)))
    .orderBy(desc(subtasks.createdAt))
    .limit(1);
  return {
    task_id: t.id,
    status: t.status,
    helper_note: subs[0]?.note ?? null,
    deadline: t.deadline.toISOString(),
    price: fromCents(t.priceCents),
  };
}

// ---------- local agent (#20) ----------

/** POST /agent/tasks/:id/claim */
export async function claimTask(
  app: FastifyInstance,
  taskId: string,
  body: ClaimTaskRequest,
): Promise<TaskView> {
  const t = await getTaskRow(app, taskId);
  if (t.status === "claimed" && body.tx_hash && body.tx_hash === t.claimTxHash)
    return taskView(app, taskId); // idempotent retry
  assertLive(app, t);
  if (t.status !== "open") throw conflict(`Task is already ${t.status}`);
  if (!t.offerId) throw conflict("The task offer is not on the ledger yet; try again shortly");

  let hash: string;
  if (body.tx_hash) {
    const v = await app.ledger.port.verifyTx(body.tx_hash, {
      kind: "task_claim",
      offerId: t.offerId,
      from: app.ledger.agentAddress,
      taskId,
    });
    hash = v.hash;
  } else if (app.ledger.fakeAgent) {
    hash = (await app.ledger.fakeAgent.acceptOffer(t.offerId, { taskId })).hash;
  } else {
    throw badRequest("tx_hash is required");
  }

  const now = app.clock.now();
  const [row] = await app.db
    .update(tasks)
    .set({
      status: "claimed",
      claimedAt: now,
      claimTxHash: hash,
      agentAckedAt: t.agentAckedAt ?? now,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, "open")))
    .returning();
  if (!row) throw conflict("Task changed state during the claim");
  await app.ledgerBridge.idle();
  const view = await taskView(app, taskId);
  app.bus.publish("task.claimed", { task: view });
  return view;
}

/** POST /agent/tasks/:id/subtasks */
export async function createSubtask(
  app: FastifyInstance,
  taskId: string,
  body: CreateSubtaskRequest,
): Promise<CreateSubtaskResponse> {
  const { db, config } = app;
  const t = await getTaskRow(app, taskId);

  if (body.subtask_id) {
    const [existing] = await db.select().from(subtasks).where(eq(subtasks.id, body.subtask_id));
    if (existing) {
      if (existing.taskId !== taskId) throw conflict("subtask_id belongs to another task");
      if (existing.offerId) {
        const view = (await loadSubtaskView(db, app.viewCtx, existing.id))!;
        return { subtask: view, claim_url: view.claim_url, claim_code: view.claim_code };
      }
      throw conflict("This sub-task exists but its ledger setup did not finish");
    }
  }
  assertLive(app, t);
  if (t.status !== "claimed") throw conflict(`Task is ${t.status}; claim it first`);
  if (body.funding_tx_hash && !body.subtask_id)
    throw badRequest("subtask_id is required with funding_tx_hash (it is the payment memo)");

  const priceCents = parsePriceCents(body.price);
  if (priceCents > t.priceCents)
    throw badRequest(`Sub-task price must be at most the task price ${fromCents(t.priceCents)}`);
  const price = fromCents(priceCents);
  let deadline = t.deadline;
  if (body.deadline) {
    const d = new Date(body.deadline);
    if (Number.isNaN(d.getTime())) throw badRequest("Invalid deadline");
    if (d < deadline) deadline = d;
  }
  const subtaskId = body.subtask_id ?? newId("sub");
  const ctx = { taskId, subtaskId };

  // 1. The agent's funding payment (agent -> vault).
  let fundingHash: string;
  if (body.funding_tx_hash) {
    const v = await app.ledger.port.verifyTx(body.funding_tx_hash, {
      kind: "subtask_funding",
      from: app.ledger.agentAddress,
      to: app.ledger.vaultAddress,
      amount: price,
      memo: subtaskId,
      ...ctx,
    });
    fundingHash = v.hash;
  } else if (app.ledger.fakeAgent) {
    fundingHash = (await app.ledger.fakeAgent.fundSubtask(subtaskId, price, { taskId })).hash;
  } else {
    throw badRequest("funding_tx_hash is required");
  }

  // 2. Sub-task row, NFT, open offer.
  const code = await uniqueClaimCode(db);
  const now = app.clock.now();
  await db.insert(subtasks).values({
    id: subtaskId,
    taskId,
    priceCents,
    deadline,
    status: "open",
    claimCode: code,
    fundingTxHash: fundingHash,
    createdAt: now,
    updatedAt: now,
  });
  try {
    const mint = await app.ledger.port.mintSubtaskNft(subtaskId, nftUri(config, subtaskId));
    await db.update(subtasks).set({ nftId: mint.nftId }).where(eq(subtasks.id, subtaskId));
    const offer = await app.ledger.port.offerSubtaskToAnyone(mint.nftId, subtaskId);
    await db
      .update(subtasks)
      .set({ offerId: offer.offerId, updatedAt: app.clock.now() })
      .where(eq(subtasks.id, subtaskId));
  } catch (err) {
    const at = app.clock.now();
    await db
      .update(subtasks)
      .set({
        status: "failed",
        failedAt: at,
        failReason: `Ledger error: ${(err as Error).message}`,
        updatedAt: at,
      })
      .where(eq(subtasks.id, subtaskId));
    throw err;
  }

  await app.ledgerBridge.idle();
  const view = (await loadSubtaskView(db, app.viewCtx, subtaskId))!;
  app.bus.publish("subtask.created", { subtask: view });
  return { subtask: view, claim_url: claimUrl(config, code), claim_code: code };
}

/** POST /agent/tasks/:id/redeem — idempotent. */
export async function redeemTask(
  app: FastifyInstance,
  taskId: string,
  body: RedeemTaskRequest,
): Promise<RedeemTaskResponse> {
  const { db } = app;
  const ledger = app.ledger.port;
  const t = await getTaskRow(app, taskId);
  const amount = fromCents(t.priceCents + t.pledgeCents);
  const paidResponse = async (row: TaskRow): Promise<RedeemTaskResponse> => ({
    task: await taskView(app, taskId),
    amount,
    payout_tx_hash: row.payoutTxHash!,
    explorer_url: ledger.explorerTxUrl(row.payoutTxHash!),
  });
  if (t.paidAt && t.payoutTxHash) return paidResponse(t);
  if (t.status === "failed") throw expired(`Task failed: ${t.failReason ?? "unknown reason"}`);
  if (t.status !== "claimed" || !t.nftId) throw conflict(`Task is ${t.status}; nothing to redeem`);
  const [paidSub] = await db
    .select({ id: subtasks.id })
    .from(subtasks)
    .where(and(eq(subtasks.taskId, taskId), isNotNull(subtasks.paidAt)))
    .limit(1);
  if (!paidSub) throw conflict("No sub-task has been paid yet; the task is not redeemable");
  if (t.payoutStartedAt) throw conflict("A redeem for this task is already in progress");

  // The agent's sell offer (task NFT -> vault for price + pledge).
  let offerId: string;
  if (body.tx_hash) {
    const v = await ledger.verifyTx(body.tx_hash, {
      kind: "agent_redeem_offer",
      nftId: t.nftId,
      amount,
      from: app.ledger.agentAddress,
      taskId,
    });
    const id = body.offer_id ?? v.offerId;
    if (!id) throw badRequest("offer_id is required");
    if (v.offerId && body.offer_id && v.offerId !== body.offer_id)
      throw badRequest("offer_id does not match the transaction");
    offerId = id;
  } else if (app.ledger.fakeAgent) {
    offerId =
      body.offer_id ??
      (await app.ledger.fakeAgent.createRedeemOffer(t.nftId, amount, { taskId })).offerId;
  } else {
    throw badRequest("offer_id and tx_hash are required");
  }

  // Claim the payout marker before the vault signs.
  const now = app.clock.now();
  const [claimed] = await db
    .update(tasks)
    .set({ payoutStartedAt: now, agentRedeemOfferId: offerId, updatedAt: now })
    .where(and(eq(tasks.id, taskId), isNull(tasks.payoutStartedAt)))
    .returning();
  if (!claimed) {
    const again = await getTaskRow(app, taskId);
    if (again.paidAt && again.payoutTxHash) return paidResponse(again);
    throw conflict("A redeem for this task is already in progress");
  }

  let payoutHash: string;
  try {
    payoutHash = (await ledger.acceptRedeemOffer(offerId, { taskId })).hash;
  } catch (err) {
    await db.update(tasks).set({ payoutStartedAt: null }).where(eq(tasks.id, taskId));
    throw err;
  }
  await db.update(tasks).set({ payoutTxHash: payoutHash }).where(eq(tasks.id, taskId));
  try {
    await ledger.burn(t.nftId, { taskId });
  } catch (err) {
    app.log.error({ err, taskId }, "task NFT burn failed after payout");
  }
  const at = app.clock.now();
  const [row] = await db
    .update(tasks)
    .set({ status: "done", doneAt: at, paidAt: at, updatedAt: at })
    .where(eq(tasks.id, taskId))
    .returning();
  await app.ledgerBridge.idle();
  const res = await paidResponse(row!);
  app.bus.publish("task.paid", {
    task: res.task,
    amount,
    tx_hash: payoutHash,
    explorer_url: res.explorer_url,
  });
  return res;
}

/** POST /agent/log */
export async function appendAgentLog(
  app: FastifyInstance,
  body: AgentLogRequest,
): Promise<AgentLogEntry> {
  const [row] = await app.db
    .insert(agentLog)
    .values({
      at: app.clock.now(),
      taskId: body.task_id ?? null,
      subtaskId: body.subtask_id ?? null,
      level: body.level,
      message: body.message,
    })
    .returning();
  const entry = agentLogRowToView(row!);
  app.bus.publish("agent.log", { entry });
  return entry;
}

// ---------- agent WebSocket resends (#20) ----------

/** task.new for every open task whose offer exists and that the agent has not acked. */
export async function unackedTaskNews(app: FastifyInstance) {
  const rows = await app.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "open"), isNull(tasks.agentAckedAt), isNotNull(tasks.offerId)))
    .orderBy(tasks.createdAt);
  const now = app.clock.now().getTime();
  return rows
    .filter((t) => t.deadline.getTime() > now)
    .map((t) => ({ type: "task.new" as const, task: taskRowToAgentTask(app.viewCtx, t) }));
}

/** task.redeemable for every claimed task with a paid sub-task and no agent payout yet. */
export async function pendingRedeemables(app: FastifyInstance): Promise<TaskRedeemableMessage[]> {
  const rows = await app.db
    .select({ task: tasks, subtaskId: subtasks.id })
    .from(tasks)
    .innerJoin(subtasks, eq(subtasks.taskId, tasks.id))
    .where(and(eq(tasks.status, "claimed"), isNull(tasks.paidAt), isNotNull(subtasks.paidAt)));
  const seen = new Set<string>();
  const out: TaskRedeemableMessage[] = [];
  for (const { task: t, subtaskId } of rows) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({
      type: "task.redeemable",
      task_id: t.id,
      subtask_id: subtaskId,
      nft_id: t.nftId,
      amount: fromCents(t.priceCents + t.pledgeCents),
      vault_address: app.ledger.vaultAddress,
    });
  }
  return out;
}

export async function ackTask(app: FastifyInstance, taskId: string): Promise<void> {
  await app.db
    .update(tasks)
    .set({ agentAckedAt: app.clock.now() })
    .where(and(eq(tasks.id, taskId), isNull(tasks.agentAckedAt)));
}

// ---------- NFT URI data (#25) ----------

export async function nftUriData(app: FastifyInstance, id: string): Promise<NftUriData> {
  const { db, config } = app;
  if (id.startsWith("sub_")) {
    const [s] = await db.select().from(subtasks).where(eq(subtasks.id, id));
    if (!s) throw notFound(`Unknown sub-task ${id}`);
    const t = await getTaskRow(app, s.taskId);
    return {
      id: s.id,
      kind: "subtask",
      description: t.description,
      place: t.place,
      price: fromCents(s.priceCents),
      deadline: s.deadline.toISOString(),
      status: s.status,
      nft_id: s.nftId,
      parent_task_id: t.id,
      parent_nft_id: t.nftId,
      board_url: boardUrl(config, t.id),
    };
  }
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!t) throw notFound(`Unknown task ${id}`);
  return {
    id: t.id,
    kind: "task",
    description: t.description,
    place: t.place,
    price: fromCents(t.priceCents),
    deadline: t.deadline.toISOString(),
    status: t.status,
    nft_id: t.nftId,
    parent_task_id: null,
    parent_nft_id: null,
    board_url: boardUrl(config, t.id),
  };
}
