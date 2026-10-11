/**
 * Database schema (Drizzle, Postgres dialect). Runs on node-postgres in production and on PGlite
 * locally and in tests.
 *
 * FROZEN after the backend foundation (#18). Parallel bundles must not change it: parallel
 * migrations would conflict. If you truly need a change, coordinate first.
 *
 * Money is stored as integer cents (`*_cents`). The API uses "5.00" strings (toCents / fromCents).
 * Timestamps are timestamptz. IDs are prefixed text IDs from newId() in @agent-pledge/shared.
 */
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
  fromDriver: (v) => (v instanceof Uint8Array ? v : Buffer.from(v as unknown as string, "hex")),
});

export const taskStatus = pgEnum("task_status", ["open", "claimed", "done", "failed"]);
export const subtaskStatus = pgEnum("subtask_status", ["open", "claimed", "done", "failed"]);
export const walletRole = pgEnum("wallet_role", ["requester", "helper", "agent", "vault"]);
export const txStatus = pgEnum("tx_status", ["pending", "validated", "failed"]);
export const txKind = pgEnum("tx_kind", [
  "wallet_setup",
  "requester_funding",
  "task_funding",
  "task_nft_mint",
  "task_offer",
  "task_claim",
  "subtask_funding",
  "subtask_nft_mint",
  "subtask_offer",
  "subtask_claim",
  "helper_redeem_offer",
  "helper_payout",
  "agent_redeem_offer",
  "agent_payout",
  "task_nft_burn",
  "subtask_nft_burn",
  "refund_requester",
  "refund_agent",
]);
export const mediaKind = pgEnum("media_kind", ["photo", "yikyak_screenshot"]);
export const agentLogLevel = pgEnum("agent_log_level", ["info", "decision", "error"]);

export const wallets = pgTable("wallets", {
  id: text("id").primaryKey(), // newId("wal")
  role: walletRole("role").notNull(),
  address: text("address").notNull().unique(),
  /** AES-256-GCM (lib/seed-crypto.ts). Null for the agent (its seed never reaches the server) and the vault (env). */
  encryptedSeed: text("encrypted_seed"),
  /** The task (requester) or sub-task (helper) this wallet was made for. */
  taskId: text("task_id"),
  subtaskId: text("subtask_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(), // newId("task")
    boardCode: text("board_code").notNull().unique(),
    description: text("description").notNull(),
    place: text("place").notNull(),
    timeLimitMinutes: integer("time_limit_minutes").notNull(),
    deadline: ts("deadline").notNull(),
    priceCents: integer("price_cents").notNull(),
    pledgeCents: integer("pledge_cents").notNull(),
    status: taskStatus("status").notNull().default("open"),
    callerPhone: text("caller_phone"),
    requesterWalletId: text("requester_wallet_id").references(() => wallets.id),
    requesterAddress: text("requester_address"),
    agentAddress: text("agent_address"),
    nftId: text("nft_id"),
    /** The vault's sell offer reserved for the agent (Amount = pledge). */
    offerId: text("offer_id"),
    /** Set when task.new has been acked over /ws/agent. Null = resend on reconnect. */
    agentAckedAt: ts("agent_acked_at"),
    claimTxHash: text("claim_tx_hash"),
    claimedAt: ts("claimed_at"),
    doneAt: ts("done_at"),
    failedAt: ts("failed_at"),
    failReason: text("fail_reason"),
    /** When task.redeemable was first sent to the agent. */
    redeemNotifiedAt: ts("redeem_notified_at"),
    /** The agent's sell offer (task NFT -> vault for price + pledge). */
    agentRedeemOfferId: text("agent_redeem_offer_id"),
    // Settlement / idempotency markers. Set *_started_at in the same UPDATE that checks it is null.
    payoutStartedAt: ts("payout_started_at"),
    payoutTxHash: text("payout_tx_hash"),
    paidAt: ts("paid_at"),
    refundStartedAt: ts("refund_started_at"),
    refundedAt: ts("refunded_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tasks_status_idx").on(t.status), index("tasks_deadline_idx").on(t.deadline)],
);

export const subtasks = pgTable(
  "subtasks",
  {
    id: text("id").primaryKey(), // newId("sub")
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    deadline: ts("deadline").notNull(),
    status: subtaskStatus("status").notNull().default("open"),
    /** 4-char code in the claim link <PUBLIC_BASE_URL>/c/<CODE>. */
    claimCode: text("claim_code").notNull().unique(),
    fundingTxHash: text("funding_tx_hash"),
    nftId: text("nft_id"),
    /** The vault's open sell offer (Amount = 0, no Destination). */
    offerId: text("offer_id"),
    helperWalletId: text("helper_wallet_id").references(() => wallets.id),
    helperAddress: text("helper_address"),
    /** Guards against two concurrent claims creating two helper wallets; the ledger decides the winner. */
    claimStartedAt: ts("claim_started_at"),
    claimTxHash: text("claim_tx_hash"),
    helperNote: text("helper_note"),
    photoMediaId: text("photo_media_id"),
    postText: text("post_text"),
    yikyakScreenshotMediaId: text("yikyak_screenshot_media_id"),
    yikyakPostedAt: ts("yikyak_posted_at"),
    claimedAt: ts("claimed_at"),
    doneAt: ts("done_at"),
    failedAt: ts("failed_at"),
    failReason: text("fail_reason"),
    // Helper payout markers (idempotency).
    helperRedeemOfferId: text("helper_redeem_offer_id"),
    payoutStartedAt: ts("payout_started_at"),
    payoutTxHash: text("payout_tx_hash"),
    paidAt: ts("paid_at"),
    burnedAt: ts("burned_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("subtasks_task_idx").on(t.taskId), index("subtasks_status_idx").on(t.status)],
);

export const transactions = pgTable(
  "transactions",
  {
    hash: text("hash").primaryKey(),
    kind: txKind("kind").notNull(),
    status: txStatus("status").notNull().default("pending"),
    amountCents: integer("amount_cents"),
    currency: text("currency"),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    memo: text("memo"),
    // No foreign keys: a tx event may arrive before its task row is written.
    taskId: text("task_id"),
    subtaskId: text("subtask_id"),
    nftId: text("nft_id"),
    offerId: text("offer_id"),
    explorerUrl: text("explorer_url").notNull(),
    error: text("error"),
    createdAt: ts("created_at").notNull().defaultNow(),
    validatedAt: ts("validated_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("transactions_task_idx").on(t.taskId),
    index("transactions_subtask_idx").on(t.subtaskId),
  ],
);

/** One PIN per task. Lockout after PIN_MAX_ATTEMPTS wrong attempts. */
export const pins = pgTable("pins", {
  taskId: text("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  /** lib/pin.ts hashPin(): scrypt$<salt>$<hash>. The plain PIN is never stored. */
  pinHash: text("pin_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  locked: boolean("locked").notNull().default(false),
  lockedAt: ts("locked_at"),
  verifiedAt: ts("verified_at"),
  /** The sub-task whose helper entered the correct PIN. */
  verifiedSubtaskId: text("verified_subtask_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Photos and Yik Yak screenshots. Bytes live in Postgres so storage works on any host and in PGlite. */
export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(), // newId("med")
    kind: mediaKind("kind").notNull(),
    taskId: text("task_id"),
    subtaskId: text("subtask_id"),
    mimeType: text("mime_type").notNull(),
    bytes: bytea("bytes").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("media_subtask_idx").on(t.subtaskId)],
);

export const agentLog = pgTable(
  "agent_log",
  {
    id: serial("id").primaryKey(),
    at: ts("at").notNull().defaultNow(),
    taskId: text("task_id"),
    subtaskId: text("subtask_id"),
    level: agentLogLevel("level").notNull().default("info"),
    message: text("message").notNull(),
  },
  (t) => [index("agent_log_task_idx").on(t.taskId)],
);

export type WalletRow = typeof wallets.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type SubtaskRow = typeof subtasks.$inferSelect;
export type NewSubtaskRow = typeof subtasks.$inferInsert;
export type TransactionRow = typeof transactions.$inferSelect;
export type PinRow = typeof pins.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type AgentLogRow = typeof agentLog.$inferSelect;
