// Owner: bundle C (#21). A pool of pre-created helper wallets so a claim does not wait for the
// XRPL faucet + trust line (10-15 s on testnet). Each pooled wallet already has a wallets row
// (role "helper", encrypted seed, no sub-task yet); a claim assigns it to the sub-task.
import { newId, type LedgerPort } from "@agent-pledge/shared";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client";
import { wallets } from "../db/schema";
import { decryptSeed, encryptSeed } from "../lib/seed-crypto";

/** Read from process.env here because config.ts is frozen. */
const PoolEnv = z.object({
  HELPER_WALLET_POOL_SIZE: z.coerce.number().int().min(0).max(50).optional(),
});

/** HELPER_WALLET_POOL_SIZE, default 3 with LEDGER_MODE=xrpl and 0 in fake mode. */
export function helperWalletPoolSize(
  env: Record<string, string | undefined>,
  mode: "fake" | "xrpl",
): number {
  const r = PoolEnv.safeParse({
    HELPER_WALLET_POOL_SIZE: env.HELPER_WALLET_POOL_SIZE || undefined,
  });
  const size = r.success ? r.data.HELPER_WALLET_POOL_SIZE : undefined;
  return size ?? (mode === "xrpl" ? 3 : 0);
}

export interface PooledWallet {
  walletId: string;
  address: string;
  seed: string;
}

export interface HelperWalletPoolOptions {
  ledger: LedgerPort;
  db: Db;
  seedKey: string;
  size: number;
  log?: FastifyBaseLogger;
  /** Reuse unassigned helper wallets from earlier runs (xrpl mode only: fake wallets die with the process). */
  reuseStored?: boolean;
  /** Wait before retrying after a failed refill (ms). */
  retryMs?: number;
}

export class HelperWalletPool {
  private readonly ready: PooledWallet[] = [];
  private filling: Promise<void> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly opts: HelperWalletPoolOptions) {}

  get size(): number {
    return this.opts.size;
  }

  /** Wallets ready to hand out right now. */
  get available(): number {
    return this.ready.length;
  }

  /** Loads leftover wallets (optional) and starts filling in the background. */
  async start(): Promise<void> {
    if (this.opts.reuseStored && this.opts.size > 0) {
      const rows = await this.opts.db
        .select()
        .from(wallets)
        .where(
          and(
            eq(wallets.role, "helper"),
            isNull(wallets.subtaskId),
            isNotNull(wallets.encryptedSeed),
          ),
        )
        .limit(this.opts.size);
      for (const r of rows) {
        try {
          this.ready.push({
            walletId: r.id,
            address: r.address,
            seed: decryptSeed(r.encryptedSeed!, this.opts.seedKey),
          });
        } catch (err) {
          this.opts.log?.warn({ err, wallet: r.id }, "could not decrypt pooled helper wallet");
        }
      }
    }
    void this.refill();
  }

  /** A pooled wallet, or a freshly created one when the pool is empty. Triggers a refill. */
  async take(): Promise<PooledWallet> {
    const w = this.ready.shift();
    void this.refill();
    return w ?? this.createOne();
  }

  /** Give back a wallet that was taken but not used (for example the claim lost the race). */
  release(w: PooledWallet): void {
    if (!this.stopped && this.ready.length < this.opts.size) this.ready.push(w);
  }

  /** Resolves when the current refill (if any) is done. */
  async idle(): Promise<void> {
    while (this.filling) await this.filling;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.filling) {
      // Do not hold shutdown hostage to a slow faucet.
      await Promise.race([this.filling, new Promise((r) => setTimeout(r, 2000).unref())]);
    }
  }

  private refill(): Promise<void> {
    if (this.filling || this.stopped) return this.filling ?? Promise.resolve();
    if (this.ready.length >= this.opts.size) return Promise.resolve();
    this.filling = (async () => {
      let failed = false;
      while (!this.stopped && !failed && this.ready.length < this.opts.size) {
        const missing = this.opts.size - this.ready.length;
        const results = await Promise.allSettled(
          Array.from({ length: missing }, () => this.createOne()),
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            if (this.stopped) continue;
            this.ready.push(r.value);
          } else {
            failed = true;
            if (!this.stopped)
              this.opts.log?.warn({ err: r.reason }, "helper wallet pool refill failed");
          }
        }
      }
      if (failed && !this.stopped) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.refill();
        }, this.opts.retryMs ?? 5000);
        this.retryTimer.unref();
      }
    })().finally(() => {
      this.filling = null;
    });
    return this.filling;
  }

  private async createOne(): Promise<PooledWallet> {
    const w = await this.opts.ledger.createWallet("helper");
    const walletId = newId("wal");
    await this.opts.db.insert(wallets).values({
      id: walletId,
      role: "helper",
      address: w.address,
      encryptedSeed: encryptSeed(w.seed, this.opts.seedKey),
    });
    return { walletId, address: w.address, seed: w.seed };
  }
}

/** One pool per app. Keyed by the shared http server so the root app and plugins see the same pool. */
const pools = new WeakMap<object, HelperWalletPool>();

export function getHelperWalletPool(app: FastifyInstance): HelperWalletPool | undefined {
  return pools.get(app.server);
}

/** Creates the app's pool and wires it to onReady / onClose of `app` (call from a plugin). */
export function setupHelperWalletPool(app: FastifyInstance): HelperWalletPool {
  const existing = pools.get(app.server);
  if (existing) return existing;
  const pool = new HelperWalletPool({
    ledger: app.ledger.port,
    db: app.db,
    seedKey: app.config.SEED_ENCRYPTION_KEY,
    size: helperWalletPoolSize(process.env, app.ledger.mode),
    log: app.log,
    reuseStored: app.ledger.mode === "xrpl",
  });
  pools.set(app.server, pool);
  app.addHook("onReady", async () => {
    await pool.start();
  });
  app.addHook("onClose", async () => {
    await pool.stop();
    pools.delete(app.server);
  });
  return pool;
}
