/**
 * Fixture factories: put a task / sub-task into a given state, running the real FakeLedger steps
 * (so NFT IDs, offers, balances, and transactions rows are consistent). Used by tests and db:seed.
 * Requires fake mode (app.ledger.fakeAgent). These are fixtures, not the product services.
 */
import {
  fromCents,
  newId,
  subtaskPriceCents,
  toCents,
  type Money,
  type SubtaskStatus,
  type TaskStatus,
} from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { uniqueBoardCode, uniqueClaimCode } from "../lib/codes";
import { generatePin, hashPin } from "../lib/pin";
import { encryptSeed } from "../lib/seed-crypto";
import { nftUri } from "../lib/urls";
import {
  agentLog,
  media,
  pins,
  subtasks,
  tasks,
  wallets,
  type SubtaskRow,
  type TaskRow,
} from "./schema";

export interface TaskFixture {
  task: TaskRow;
  pin: string;
  requesterSeed: string;
  subtasks: SubtaskFixture[];
}
export interface SubtaskFixture {
  subtask: SubtaskRow;
  helperSeed: string | null;
}

export interface TaskFixtureOptions {
  status?: TaskStatus;
  description?: string;
  place?: string;
  price?: Money;
  timeLimitMinutes?: number;
  pin?: string;
  callerPhone?: string | null;
  /** Sub-task state for claimed tasks (default "open"; "none" = no sub-task). Ignored for open/done/failed. */
  subtask?: Exclude<SubtaskStatus, "failed"> | "none";
  /** Add a seat photo + note to claimed/done sub-tasks (default true). */
  photo?: boolean;
  /** Add a Yik Yak post + screenshot to sub-tasks (default true). */
  yikyak?: boolean;
  /** Add agent_log rows (default true). */
  log?: boolean;
  /** Mark task.new as acked by the agent (default true). */
  acked?: boolean;
}

function fakeAgentOf(app: FastifyInstance) {
  const a = app.ledger.fakeAgent;
  if (!a) throw new Error("factories need LEDGER_MODE=fake");
  return a;
}

export function placeholderSvg(label: string, color: string): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
<rect width="640" height="480" fill="${color}"/>
<text x="320" y="250" font-family="sans-serif" font-size="36" fill="#fff" text-anchor="middle">${label}</text>
</svg>`;
  return new TextEncoder().encode(svg);
}

async function log(
  app: FastifyInstance,
  taskId: string,
  message: string,
  level: "info" | "decision" = "info",
  subtaskId?: string,
) {
  await app.db.insert(agentLog).values({ taskId, subtaskId, level, message, at: app.clock.now() });
}

/** A task in `status` with consistent ledger state. */
export async function insertTask(
  app: FastifyInstance,
  opts: TaskFixtureOptions = {},
): Promise<TaskFixture> {
  const { db, config, clock } = app;
  const ledger = app.ledger.port;
  const status = opts.status ?? "open";
  const priceCents = toCents(opts.price ?? "5.00");
  const pledgeCents = toCents(config.PLEDGE_AMOUNT);
  const timeLimit = opts.timeLimitMinutes ?? 10;
  const now = clock.now();
  const pin = opts.pin ?? generatePin();
  const taskId = newId("task");
  const withLog = opts.log ?? true;

  // Requester wallet + funding.
  const w = await ledger.createWallet("requester");
  const walletId = newId("wal");
  await db.insert(wallets).values({
    id: walletId,
    role: "requester",
    address: w.address,
    encryptedSeed: encryptSeed(w.seed, config.SEED_ENCRYPTION_KEY),
    taskId,
  });
  await db.insert(tasks).values({
    id: taskId,
    boardCode: await uniqueBoardCode(db),
    description: opts.description ?? "Save a seat at the front table",
    place: opts.place ?? "Main Stacks, front table",
    timeLimitMinutes: timeLimit,
    deadline: new Date(now.getTime() + timeLimit * 60_000),
    priceCents,
    pledgeCents,
    status: "open",
    callerPhone: opts.callerPhone === undefined ? "+15105550123" : opts.callerPhone,
    requesterWalletId: walletId,
    requesterAddress: w.address,
    agentAddress: app.ledger.agentAddress,
    agentAckedAt: opts.acked === false ? null : now,
    createdAt: now,
  });
  await db.insert(pins).values({ taskId, pinHash: hashPin(pin) });

  const price = fromCents(priceCents);
  await ledger.fundRequester(w.address, price, { taskId });
  await ledger.fundTask(w.seed, taskId, price);
  const mint = await ledger.mintTaskNft(taskId, nftUri(config, taskId));
  const offer = await ledger.offerTaskToAgent(
    mint.nftId,
    config.PLEDGE_AMOUNT,
    app.ledger.agentAddress,
    taskId,
  );
  await db
    .update(tasks)
    .set({ nftId: mint.nftId, offerId: offer.offerId })
    .where(eq(tasks.id, taskId));
  if (withLog)
    await log(app, taskId, `New task: ${opts.description ?? "Save a seat"} for $${price}`);

  const result: TaskFixture = {
    task: await getTask(app, taskId),
    pin,
    requesterSeed: w.seed,
    subtasks: [],
  };
  if (status === "open") return finish(app, result);

  // Agent claims (pledge).
  const claim = await fakeAgentOf(app).acceptOffer(offer.offerId, { taskId });
  await db
    .update(tasks)
    .set({ status: "claimed", claimedAt: clock.now(), claimTxHash: claim.hash })
    .where(eq(tasks.id, taskId));
  if (withLog)
    await log(
      app,
      taskId,
      `Claimed the task and paid a $${config.PLEDGE_AMOUNT} pledge`,
      "decision",
    );

  const subState: SubtaskStatus | "none" =
    status === "done" ? "done" : status === "failed" ? "open" : (opts.subtask ?? "open");
  if (subState !== "none") {
    if (withLog) {
      const sp = fromCents(subtaskPriceCents(priceCents));
      await log(app, taskId, `Sub-task price: $${sp} (80% of $${price})`, "decision");
    }
    result.subtasks.push(
      await insertSubtask(app, taskId, {
        status: subState,
        photo: opts.photo,
        yikyak: opts.yikyak,
      }),
    );
  }

  if (status === "done") {
    const t = await getTask(app, taskId);
    const amount = fromCents(t.priceCents + t.pledgeCents);
    const redeem = await fakeAgentOf(app).createRedeemOffer(t.nftId!, amount, { taskId });
    await db
      .update(tasks)
      .set({
        agentRedeemOfferId: redeem.offerId,
        redeemNotifiedAt: clock.now(),
        payoutStartedAt: clock.now(),
      })
      .where(eq(tasks.id, taskId));
    const payout = await ledger.acceptRedeemOffer(redeem.offerId, { taskId });
    await ledger.burn(t.nftId!, { taskId });
    await db
      .update(tasks)
      .set({ status: "done", doneAt: clock.now(), paidAt: clock.now(), payoutTxHash: payout.hash })
      .where(eq(tasks.id, taskId));
    if (withLog) await log(app, taskId, `Redeemed the task NFT for $${amount}`, "decision");
  }

  if (status === "failed") {
    const t = await getTask(app, taskId);
    const subs = result.subtasks.map((s) => s.subtask);
    await db.update(tasks).set({ refundStartedAt: clock.now() }).where(eq(tasks.id, taskId));
    await ledger.failTask({
      taskId,
      taskNftId: t.nftId,
      subtaskNftIds: subs.map((s) => s.nftId).filter((x): x is string => !!x),
      subtaskIds: subs.filter((s) => s.nftId).map((s) => s.id),
      requesterAddress: w.address,
      refundToRequester: fromCents(t.priceCents + t.pledgeCents),
      agentAddress: app.ledger.agentAddress,
      refundToAgent: fromCents(subs.reduce((n, s) => n + s.priceCents, 0)),
    });
    const at = clock.now();
    await db
      .update(tasks)
      .set({
        status: "failed",
        failedAt: at,
        failReason: "No helper saved the seat in time",
        refundedAt: at,
      })
      .where(eq(tasks.id, taskId));
    await db
      .update(subtasks)
      .set({ status: "failed", failedAt: at, failReason: "Task failed", burnedAt: at })
      .where(eq(subtasks.taskId, taskId));
    if (withLog)
      await log(
        app,
        taskId,
        "Deadline passed with no PIN. Task failed, requester refunded with the pledge.",
      );
  }
  return finish(app, result);
}

/** A sub-task of a claimed task, in `status`. */
export async function insertSubtask(
  app: FastifyInstance,
  taskId: string,
  opts: { status?: SubtaskStatus; price?: Money; photo?: boolean; yikyak?: boolean } = {},
): Promise<SubtaskFixture> {
  const { db, config, clock } = app;
  const ledger = app.ledger.port;
  const t = await getTask(app, taskId);
  const status = opts.status ?? "open";
  const priceCents = opts.price ? toCents(opts.price) : subtaskPriceCents(t.priceCents);
  const price = fromCents(priceCents);
  const subtaskId = newId("sub");
  const code = await uniqueClaimCode(db);
  await db.insert(subtasks).values({
    id: subtaskId,
    taskId,
    priceCents,
    deadline: t.deadline,
    status: "open",
    claimCode: code,
    createdAt: clock.now(),
  });
  const ctx = { taskId, subtaskId };
  const funding = await fakeAgentOf(app).fundSubtask(subtaskId, price, { taskId });
  const mint = await ledger.mintSubtaskNft(subtaskId, nftUri(config, subtaskId));
  const offer = await ledger.offerSubtaskToAnyone(mint.nftId, subtaskId);
  await db
    .update(subtasks)
    .set({ fundingTxHash: funding.hash, nftId: mint.nftId, offerId: offer.offerId })
    .where(eq(subtasks.id, subtaskId));

  if (opts.yikyak ?? true) {
    const postText = `$${price} to ${t.description.toLowerCase()} in the next ${t.timeLimitMinutes} min. First to claim gets it: ${config.PUBLIC_BASE_URL}/c/${code}`;
    const mediaId = await insertMedia(app, {
      kind: "yikyak_screenshot",
      taskId,
      subtaskId,
      label: "Yik Yak post",
      color: "#5b3fd1",
    });
    await db
      .update(subtasks)
      .set({ postText, yikyakScreenshotMediaId: mediaId, yikyakPostedAt: clock.now() })
      .where(eq(subtasks.id, subtaskId));
  }

  let helperSeed: string | null = null;
  if (status === "claimed" || status === "done") {
    const hw = await ledger.createWallet("helper");
    helperSeed = hw.seed;
    const walletId = newId("wal");
    await db.insert(wallets).values({
      id: walletId,
      role: "helper",
      address: hw.address,
      encryptedSeed: encryptSeed(hw.seed, config.SEED_ENCRYPTION_KEY),
      taskId,
      subtaskId,
    });
    const accept = await ledger.acceptOffer(hw.seed, offer.offerId, ctx);
    await db
      .update(subtasks)
      .set({
        status: "claimed",
        helperWalletId: walletId,
        helperAddress: hw.address,
        claimStartedAt: clock.now(),
        claimTxHash: accept.hash,
        claimedAt: clock.now(),
      })
      .where(eq(subtasks.id, subtaskId));
    if (opts.photo ?? true) {
      const mediaId = await insertMedia(app, {
        kind: "photo",
        taskId,
        subtaskId,
        label: "Seat saved",
        color: "#1f8a4c",
      });
      await db
        .update(subtasks)
        .set({ photoMediaId: mediaId, helperNote: "Front table, left side" })
        .where(eq(subtasks.id, subtaskId));
    }
  }

  if (status === "done") {
    await db
      .update(pins)
      .set({ verifiedAt: clock.now(), verifiedSubtaskId: subtaskId })
      .where(eq(pins.taskId, taskId));
    const redeem = await ledger.createRedeemOffer(helperSeed!, mint.nftId, price, ctx);
    await db
      .update(subtasks)
      .set({ helperRedeemOfferId: redeem.offerId, payoutStartedAt: clock.now() })
      .where(eq(subtasks.id, subtaskId));
    const payout = await ledger.acceptRedeemOffer(redeem.offerId, ctx);
    await ledger.burn(mint.nftId, ctx);
    const at = clock.now();
    await db
      .update(subtasks)
      .set({ status: "done", doneAt: at, paidAt: at, payoutTxHash: payout.hash, burnedAt: at })
      .where(eq(subtasks.id, subtaskId));
  }

  if (status === "failed") {
    const at = clock.now();
    await db
      .update(subtasks)
      .set({ status: "failed", failedAt: at, failReason: "Failed" })
      .where(eq(subtasks.id, subtaskId));
  }

  await app.ledgerBridge.idle();
  const [row] = await db.select().from(subtasks).where(eq(subtasks.id, subtaskId));
  return { subtask: row!, helperSeed };
}

export async function insertMedia(
  app: FastifyInstance,
  m: {
    kind: "photo" | "yikyak_screenshot";
    taskId: string;
    subtaskId: string;
    label: string;
    color: string;
  },
): Promise<string> {
  const id = newId("med");
  const bytes = placeholderSvg(m.label, m.color);
  await app.db.insert(media).values({
    id,
    kind: m.kind,
    taskId: m.taskId,
    subtaskId: m.subtaskId,
    mimeType: "image/svg+xml",
    bytes,
    sizeBytes: bytes.byteLength,
    width: 640,
    height: 480,
    createdAt: app.clock.now(),
  });
  return id;
}

async function getTask(app: FastifyInstance, id: string): Promise<TaskRow> {
  const [t] = await app.db.select().from(tasks).where(eq(tasks.id, id));
  if (!t) throw new Error(`task ${id} not found`);
  return t;
}

async function finish(app: FastifyInstance, r: TaskFixture): Promise<TaskFixture> {
  await app.ledgerBridge.idle();
  r.task = await getTask(app, r.task.id);
  const subs = await app.db.select().from(subtasks).where(eq(subtasks.taskId, r.task.id));
  r.subtasks = r.subtasks.map((s) => ({
    ...s,
    subtask: subs.find((x) => x.id === s.subtask.id) ?? s.subtask,
  }));
  return r;
}
