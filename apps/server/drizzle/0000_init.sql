CREATE TYPE "public"."agent_log_level" AS ENUM('info', 'decision', 'error');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'yikyak_screenshot');--> statement-breakpoint
CREATE TYPE "public"."subtask_status" AS ENUM('open', 'claimed', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'claimed', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tx_kind" AS ENUM('wallet_setup', 'requester_funding', 'task_funding', 'task_nft_mint', 'task_offer', 'task_claim', 'subtask_funding', 'subtask_nft_mint', 'subtask_offer', 'subtask_claim', 'helper_redeem_offer', 'helper_payout', 'agent_redeem_offer', 'agent_payout', 'task_nft_burn', 'subtask_nft_burn', 'refund_requester', 'refund_agent');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'validated', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wallet_role" AS ENUM('requester', 'helper', 'agent', 'vault');--> statement-breakpoint
CREATE TABLE "agent_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" text,
	"subtask_id" text,
	"level" "agent_log_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "media_kind" NOT NULL,
	"task_id" text,
	"subtask_id" text,
	"mime_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pins" (
	"task_id" text PRIMARY KEY NOT NULL,
	"pin_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_subtask_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtasks" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"price_cents" integer NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" "subtask_status" DEFAULT 'open' NOT NULL,
	"claim_code" text NOT NULL,
	"funding_tx_hash" text,
	"nft_id" text,
	"offer_id" text,
	"helper_wallet_id" text,
	"helper_address" text,
	"claim_started_at" timestamp with time zone,
	"claim_tx_hash" text,
	"helper_note" text,
	"photo_media_id" text,
	"post_text" text,
	"yikyak_screenshot_media_id" text,
	"yikyak_posted_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"fail_reason" text,
	"helper_redeem_offer_id" text,
	"payout_started_at" timestamp with time zone,
	"payout_tx_hash" text,
	"paid_at" timestamp with time zone,
	"burned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtasks_claim_code_unique" UNIQUE("claim_code")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"board_code" text NOT NULL,
	"description" text NOT NULL,
	"place" text NOT NULL,
	"time_limit_minutes" integer NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"price_cents" integer NOT NULL,
	"pledge_cents" integer NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"caller_phone" text,
	"requester_wallet_id" text,
	"requester_address" text,
	"agent_address" text,
	"nft_id" text,
	"offer_id" text,
	"agent_acked_at" timestamp with time zone,
	"claim_tx_hash" text,
	"claimed_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"fail_reason" text,
	"redeem_notified_at" timestamp with time zone,
	"agent_redeem_offer_id" text,
	"payout_started_at" timestamp with time zone,
	"payout_tx_hash" text,
	"paid_at" timestamp with time zone,
	"refund_started_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_board_code_unique" UNIQUE("board_code")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"hash" text PRIMARY KEY NOT NULL,
	"kind" "tx_kind" NOT NULL,
	"status" "tx_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer,
	"currency" text,
	"from_address" text,
	"to_address" text,
	"memo" text,
	"task_id" text,
	"subtask_id" text,
	"nft_id" text,
	"offer_id" text,
	"explorer_url" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "wallet_role" NOT NULL,
	"address" text NOT NULL,
	"encrypted_seed" text,
	"task_id" text,
	"subtask_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_helper_wallet_id_wallets_id_fk" FOREIGN KEY ("helper_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_requester_wallet_id_wallets_id_fk" FOREIGN KEY ("requester_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_log_task_idx" ON "agent_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "media_subtask_idx" ON "media" USING btree ("subtask_id");--> statement-breakpoint
CREATE INDEX "subtasks_task_idx" ON "subtasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "subtasks_status_idx" ON "subtasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_deadline_idx" ON "tasks" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "transactions_task_idx" ON "transactions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "transactions_subtask_idx" ON "transactions" USING btree ("subtask_id");