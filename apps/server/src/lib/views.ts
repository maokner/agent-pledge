/**
 * Row -> view mappers and loaders for the board, the agent, and the claim page.
 * Every bundle uses these so the wire shapes stay identical.
 */
import {
  fromCents,
  PIN_MAX_ATTEMPTS,
  type AgentLogEntry,
  type AgentTask,
  type BoardState,
  type ClaimView,
  type Currency,
  type MediaView,
  type PinState,
  type SubtaskView,
  type TaskView,
  type TxView,
} from "@agent-pledge/shared";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db/client";
import {
  agentLog,
  media,
  pins,
  subtasks,
  tasks,
  transactions,
  type AgentLogRow,
  type PinRow,
  type SubtaskRow,
  type TaskRow,
  type TransactionRow,
} from "../db/schema";
import { boardUrl, claimUrl, mediaUrl } from "./urls";

export interface ViewCtx {
  config: Config;
  explorerNftUrl: (nftId: string) => string;
  vaultAddress?: string | null;
  agentAddress?: string | null;
}

/** Media columns without the bytes. */
export const mediaMetaColumns = {
  id: media.id,
  kind: media.kind,
  taskId: media.taskId,
  subtaskId: media.subtaskId,
  mimeType: media.mimeType,
  width: media.width,
  height: media.height,
  createdAt: media.createdAt,
};
export type MediaMeta = {
  id: string;
  kind: "photo" | "yikyak_screenshot";
  taskId: string | null;
  subtaskId: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: Date;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const money = (c: number | null | undefined) => (c == null ? null : fromCents(c));

export function txRowToView(r: TransactionRow): TxView {
  return {
    hash: r.hash,
    kind: r.kind,
    status: r.status,
    amount: money(r.amountCents),
    currency: (r.currency as Currency | null) ?? null,
    from: r.fromAddress,
    to: r.toAddress,
    memo: r.memo,
    task_id: r.taskId,
    subtask_id: r.subtaskId,
    nft_id: r.nftId,
    offer_id: r.offerId,
    explorer_url: r.explorerUrl,
    error: r.error,
    created_at: r.createdAt.toISOString(),
    validated_at: iso(r.validatedAt),
  };
}

export function mediaToView(cfg: Config, m: MediaMeta): MediaView {
  return {
    id: m.id,
    kind: m.kind,
    task_id: m.taskId,
    subtask_id: m.subtaskId,
    url: mediaUrl(cfg, m.id),
    mime_type: m.mimeType,
    width: m.width,
    height: m.height,
    created_at: m.createdAt.toISOString(),
  };
}

export function pinRowToState(p: PinRow | undefined | null): PinState {
  const attempts = p?.attempts ?? 0;
  return {
    attempts,
    attempts_left: Math.max(0, PIN_MAX_ATTEMPTS - attempts),
    locked: p?.locked ?? false,
    verified: !!p?.verifiedAt,
  };
}

export function agentLogRowToView(r: AgentLogRow): AgentLogEntry {
  return {
    id: r.id,
    at: r.at.toISOString(),
    task_id: r.taskId,
    subtask_id: r.subtaskId,
    level: r.level,
    message: r.message,
  };
}

export function subtaskRowToView(
  ctx: ViewCtx,
  s: SubtaskRow,
  mediaById: Map<string, MediaMeta>,
): SubtaskView {
  const m = (id: string | null) => {
    const row = id ? mediaById.get(id) : undefined;
    return row ? mediaToView(ctx.config, row) : null;
  };
  return {
    id: s.id,
    task_id: s.taskId,
    price: fromCents(s.priceCents),
    deadline: s.deadline.toISOString(),
    status: s.status,
    claim_code: s.claimCode,
    claim_url: claimUrl(ctx.config, s.claimCode),
    helper_address: s.helperAddress,
    nft_id: s.nftId,
    nft_explorer_url: s.nftId ? ctx.explorerNftUrl(s.nftId) : null,
    offer_id: s.offerId,
    helper_note: s.helperNote,
    photo: m(s.photoMediaId),
    post_text: s.postText,
    yikyak_screenshot: m(s.yikyakScreenshotMediaId),
    yikyak_posted_at: iso(s.yikyakPostedAt),
    created_at: s.createdAt.toISOString(),
    claimed_at: iso(s.claimedAt),
    done_at: iso(s.doneAt),
    failed_at: iso(s.failedAt),
    paid_at: iso(s.paidAt),
    payout_tx_hash: s.payoutTxHash,
  };
}

export function taskRowToView(
  ctx: ViewCtx,
  t: TaskRow,
  parts: { subtasks: SubtaskView[]; transactions: TxView[]; pin: PinRow | undefined | null },
): TaskView {
  return {
    id: t.id,
    board_code: t.boardCode,
    description: t.description,
    place: t.place,
    time_limit_minutes: t.timeLimitMinutes,
    deadline: t.deadline.toISOString(),
    price: fromCents(t.priceCents),
    pledge: fromCents(t.pledgeCents),
    status: t.status,
    requester_address: t.requesterAddress,
    agent_address: t.agentAddress,
    nft_id: t.nftId,
    nft_explorer_url: t.nftId ? ctx.explorerNftUrl(t.nftId) : null,
    offer_id: t.offerId,
    created_at: t.createdAt.toISOString(),
    claimed_at: iso(t.claimedAt),
    done_at: iso(t.doneAt),
    failed_at: iso(t.failedAt),
    fail_reason: t.failReason,
    paid_at: iso(t.paidAt),
    refunded_at: iso(t.refundedAt),
    pin: pinRowToState(parts.pin),
    subtasks: parts.subtasks,
    transactions: parts.transactions,
  };
}

/** Loads full TaskViews (newest first). Pass ids to load only those tasks. */
export async function loadTaskViews(db: Db, ctx: ViewCtx, ids?: string[]): Promise<TaskView[]> {
  if (ids && ids.length === 0) return [];
  const taskRows = ids
    ? await db.select().from(tasks).where(inArray(tasks.id, ids)).orderBy(desc(tasks.createdAt))
    : await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  if (taskRows.length === 0) return [];
  const taskIds = taskRows.map((t) => t.id);
  const [subRows, txRows, pinRows, mediaRows] = await Promise.all([
    db
      .select()
      .from(subtasks)
      .where(inArray(subtasks.taskId, taskIds))
      .orderBy(asc(subtasks.createdAt)),
    db
      .select()
      .from(transactions)
      .where(inArray(transactions.taskId, taskIds))
      .orderBy(asc(transactions.createdAt)),
    db.select().from(pins).where(inArray(pins.taskId, taskIds)),
    db.select(mediaMetaColumns).from(media).where(inArray(media.taskId, taskIds)),
  ]);
  const mediaById = new Map(mediaRows.map((m) => [m.id, m]));
  return taskRows.map((t) =>
    taskRowToView(ctx, t, {
      subtasks: subRows
        .filter((s) => s.taskId === t.id)
        .map((s) => subtaskRowToView(ctx, s, mediaById)),
      transactions: txRows.filter((x) => x.taskId === t.id).map(txRowToView),
      pin: pinRows.find((p) => p.taskId === t.id),
    }),
  );
}

export async function loadTaskView(db: Db, ctx: ViewCtx, id: string): Promise<TaskView | null> {
  const [v] = await loadTaskViews(db, ctx, [id]);
  return v ?? null;
}

export async function loadSubtaskView(
  db: Db,
  ctx: ViewCtx,
  id: string,
): Promise<SubtaskView | null> {
  const [s] = await db.select().from(subtasks).where(eq(subtasks.id, id));
  if (!s) return null;
  const mediaIds = [s.photoMediaId, s.yikyakScreenshotMediaId].filter((x): x is string => !!x);
  const mediaRows = mediaIds.length
    ? await db.select(mediaMetaColumns).from(media).where(inArray(media.id, mediaIds))
    : [];
  return subtaskRowToView(ctx, s, new Map(mediaRows.map((m) => [m.id, m])));
}

export async function loadBoardState(
  db: Db,
  ctx: ViewCtx,
  seq: number,
  now = new Date(),
): Promise<BoardState> {
  const [taskViews, logRows] = await Promise.all([
    loadTaskViews(db, ctx),
    db.select().from(agentLog).orderBy(desc(agentLog.id)).limit(200),
  ]);
  return {
    seq,
    generated_at: now.toISOString(),
    tasks: taskViews,
    agent_log: logRows.map(agentLogRowToView),
    vault_address: ctx.vaultAddress ?? null,
    agent_address: ctx.agentAddress ?? null,
  };
}

export function taskRowToAgentTask(ctx: ViewCtx, t: TaskRow): AgentTask {
  return {
    id: t.id,
    description: t.description,
    place: t.place,
    time_limit_minutes: t.timeLimitMinutes,
    deadline: t.deadline.toISOString(),
    price: fromCents(t.priceCents),
    pledge: fromCents(t.pledgeCents),
    status: t.status,
    nft_id: t.nftId,
    offer_id: t.offerId,
    vault_address: ctx.vaultAddress ?? null,
    board_url: boardUrl(ctx.config, t.id),
    created_at: t.createdAt.toISOString(),
  };
}

/** The claim page view of a sub-task, by claim code. */
export async function loadClaimView(
  db: Db,
  ctx: ViewCtx,
  code: string,
  claimedByYou: boolean,
): Promise<ClaimView | null> {
  const [s] = await db.select().from(subtasks).where(eq(subtasks.claimCode, code));
  if (!s) return null;
  const [[t], [p], mediaRows, payoutTx] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.id, s.taskId)),
    db.select().from(pins).where(eq(pins.taskId, s.taskId)),
    s.photoMediaId
      ? db.select(mediaMetaColumns).from(media).where(eq(media.id, s.photoMediaId))
      : Promise.resolve([] as MediaMeta[]),
    s.payoutTxHash
      ? db.select().from(transactions).where(eq(transactions.hash, s.payoutTxHash))
      : Promise.resolve([] as TransactionRow[]),
  ]);
  if (!t) return null;
  const photo = mediaRows[0];
  const ptx = payoutTx[0];
  return {
    code: s.claimCode,
    subtask_id: s.id,
    task_id: s.taskId,
    description: t.description,
    place: t.place,
    price: fromCents(s.priceCents),
    deadline: s.deadline.toISOString(),
    status: s.status,
    claimed_by_you: claimedByYou,
    helper_note: s.helperNote,
    photo: photo ? mediaToView(ctx.config, photo) : null,
    pin: pinRowToState(p),
    payout:
      s.paidAt && s.payoutTxHash
        ? {
            amount: fromCents(s.priceCents),
            tx_hash: s.payoutTxHash,
            explorer_url: ptx?.explorerUrl ?? "",
          }
        : null,
  };
}

/** Task ID for a sub-task (used when a tx event only has a subtaskId). */
export async function taskIdForSubtask(db: Db, subtaskId: string): Promise<string | null> {
  const [s] = await db
    .select({ taskId: subtasks.taskId })
    .from(subtasks)
    .where(eq(subtasks.id, subtaskId));
  return s?.taskId ?? null;
}
