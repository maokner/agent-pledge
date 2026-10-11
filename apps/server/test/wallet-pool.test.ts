import { eq, isNull, and } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { subtasks, wallets } from "../src/db/schema";
import { decryptSeed } from "../src/lib/seed-crypto";
import {
  getHelperWalletPool,
  HelperWalletPool,
  helperWalletPoolSize,
} from "../src/services/wallet-pool";
import { buildTestApp, insertTask, type TestApp } from "./helpers";

let t: TestApp | undefined;
afterEach(async () => {
  delete process.env.HELPER_WALLET_POOL_SIZE;
  await t?.close();
  t = undefined;
});

describe("helperWalletPoolSize", () => {
  it("defaults to 3 in xrpl mode and 0 in fake mode; env overrides", () => {
    expect(helperWalletPoolSize({}, "xrpl")).toBe(3);
    expect(helperWalletPoolSize({}, "fake")).toBe(0);
    expect(helperWalletPoolSize({ HELPER_WALLET_POOL_SIZE: "5" }, "fake")).toBe(5);
    expect(helperWalletPoolSize({ HELPER_WALLET_POOL_SIZE: "junk" }, "xrpl")).toBe(3);
  });
});

describe("HelperWalletPool", () => {
  it("hands out pre-created wallets and refills in the background", async () => {
    t = await buildTestApp();
    const addresses: string[] = [];
    const port = t.app.ledger.port;
    const pool = new HelperWalletPool({
      ledger: {
        createWallet: async (role) => {
          const w = await port.createWallet(role);
          addresses.push(w.address);
          return w;
        },
      } as typeof port,
      db: t.db,
      seedKey: t.config.SEED_ENCRYPTION_KEY,
      size: 2,
    });
    await pool.start();
    await pool.idle();
    expect(pool.available).toBe(2);
    const precreated = [...addresses];
    expect(precreated).toHaveLength(2);

    const w = await pool.take();
    expect(precreated).toContain(w.address); // came from the pool, not a fresh createWallet
    const [row] = await t.db.select().from(wallets).where(eq(wallets.id, w.walletId));
    expect(row).toMatchObject({ role: "helper", address: w.address, subtaskId: null });
    expect(decryptSeed(row!.encryptedSeed!, t.config.SEED_ENCRYPTION_KEY)).toBe(w.seed);

    await pool.idle();
    expect(pool.available).toBe(2);
    expect(addresses).toHaveLength(3);
    await pool.stop();
  });

  it("falls back to createWallet when empty", async () => {
    t = await buildTestApp();
    const pool = new HelperWalletPool({
      ledger: t.app.ledger.port,
      db: t.db,
      seedKey: t.config.SEED_ENCRYPTION_KEY,
      size: 0,
    });
    await pool.start();
    expect(pool.available).toBe(0);
    const w = await pool.take();
    expect(t.fake.addressForSeed(w.seed)).toBe(w.address);
    await pool.stop();
  });

  it("the claim endpoint uses a pooled wallet (HELPER_WALLET_POOL_SIZE)", async () => {
    process.env.HELPER_WALLET_POOL_SIZE = "2";
    t = await buildTestApp();
    const pool = getHelperWalletPool(t.app)!;
    expect(pool.size).toBe(2);
    await pool.idle();
    const pooled = await t.db
      .select()
      .from(wallets)
      .where(and(eq(wallets.role, "helper"), isNull(wallets.subtaskId)));
    expect(pooled).toHaveLength(2);

    const f = await insertTask(t.app, { status: "claimed", subtask: "open" });
    const s = f.subtasks[0]!.subtask;
    const res = await t.app.inject({ method: "POST", url: `/claim/${s.claimCode}/claim` });
    expect(res.statusCode).toBe(200);
    const [row] = await t.db.select().from(subtasks).where(eq(subtasks.id, s.id));
    expect(pooled.map((p) => p.id)).toContain(row!.helperWalletId);

    await pool.idle();
    expect(pool.available).toBe(2);
  });
});
