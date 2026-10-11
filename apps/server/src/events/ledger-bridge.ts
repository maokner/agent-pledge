import { toCents, type LedgerPort, type TxEvent } from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client";
import { transactions } from "../db/schema";
import type { Clock } from "../lib/clock";
import { taskIdForSubtask, txRowToView } from "../lib/views";
import type { EventBus } from "./bus";

/**
 * Bridges ledger tx events into the transactions table and the board:
 * pending -> upsert row + tx.pending; validated -> update + tx.validated; failed -> update + tx.failed.
 * Events are processed one at a time in arrival order, so pending is always written before validated.
 * `idle()` resolves when every event received so far has been written (useful in tests).
 */
export function bridgeLedgerEvents(opts: {
  ledger: LedgerPort;
  db: Db;
  bus: EventBus;
  clock: Clock;
  log?: FastifyBaseLogger;
}) {
  const { ledger, db, bus, clock, log } = opts;
  let chain: Promise<void> = Promise.resolve();

  const handle = async (e: TxEvent) => {
    const taskId = e.taskId ?? (e.subtaskId ? await taskIdForSubtask(db, e.subtaskId) : null);
    const now = clock.now();
    const values = {
      hash: e.hash,
      kind: e.kind,
      status: e.status,
      amountCents: e.amount != null ? toCents(e.amount) : null,
      currency: e.currency ?? (e.amount != null ? "RLUSD" : null),
      fromAddress: e.from ?? null,
      toAddress: e.to ?? null,
      memo: e.memo ?? null,
      taskId,
      subtaskId: e.subtaskId ?? null,
      nftId: e.nftId ?? null,
      offerId: e.offerId ?? null,
      explorerUrl: e.explorerUrl,
      error: e.error ?? null,
      createdAt: now,
      validatedAt: e.status === "validated" ? now : null,
      updatedAt: now,
    };
    const [existing] = await db.select().from(transactions).where(eq(transactions.hash, e.hash));
    if (existing && existing.status !== "pending" && e.status === "pending") return; // stale
    let row;
    if (!existing) {
      [row] = await db.insert(transactions).values(values).returning();
    } else {
      // Keep earlier non-null fields; a later event may carry fewer details.
      const merged = Object.fromEntries(
        Object.entries(values).filter(([k, v]) => v !== null && k !== "createdAt" && k !== "hash"),
      );
      [row] = await db
        .update(transactions)
        .set(merged)
        .where(eq(transactions.hash, e.hash))
        .returning();
    }
    if (!row) return;
    const tx = txRowToView(row);
    bus.publish(
      e.status === "pending"
        ? "tx.pending"
        : e.status === "validated"
          ? "tx.validated"
          : "tx.failed",
      {
        tx,
      },
    );
  };

  const unsubscribe = ledger.onTx((e) => {
    chain = chain
      .then(() => handle(e))
      .catch((err) => log?.error({ err, hash: e.hash }, "ledger bridge failed"));
  });

  return {
    unsubscribe,
    idle: () => chain,
  };
}

export type LedgerBridge = ReturnType<typeof bridgeLedgerEvents>;
