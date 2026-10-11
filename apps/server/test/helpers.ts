/**
 * Test helpers: an app on in-memory PGlite + FakeLedger (0 ms latency) + fixed secrets.
 *
 *   const t = await buildTestApp();
 *   const res = await t.app.inject({ method: "GET", url: "/health" });
 *   const f = await insertTask(t.app, { status: "claimed", subtask: "claimed" });
 *   t.fake.balanceOf(t.fake.vaultAddress);
 *   await t.close();
 */
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { testConfig, type Config } from "../src/config";
import { createDb, type Db } from "../src/db/client";
import { FakeLedger, fakeLedgerHandle } from "../src/ledger";
import { ManualClock } from "../src/lib/clock";
import type { EventBus } from "../src/events/bus";

export { insertMedia, insertSubtask, insertTask } from "../src/db/factories";

export const TEST_VOICE_SECRET = "test-voice-secret";
export const TEST_AGENT_TOKEN = "test-agent-token";
export const voiceHeaders = { "x-agent-pledge-secret": TEST_VOICE_SECRET };
export const agentHeaders = { authorization: `Bearer ${TEST_AGENT_TOKEN}` };

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  fake: FakeLedger;
  bus: EventBus;
  config: Config;
  /** Starts at 2026-10-11T18:00:00Z. Use clock.advance(ms) to pass deadlines. */
  clock: ManualClock;
  close(): Promise<void>;
}

export async function buildTestApp(
  opts: {
    config?: Partial<Record<keyof Config, string>>;
    latencyMs?: number;
    clock?: ManualClock;
  } = {},
): Promise<TestApp> {
  const config = testConfig(opts.config);
  const dbh = await createDb("memory://");
  await dbh.migrate();
  const fake = new FakeLedger({ latencyMs: opts.latencyMs ?? 0, agentBalance: "100.00" });
  const clock = opts.clock ?? new ManualClock();
  const app = await buildApp({ config, db: dbh.db, ledger: fakeLedgerHandle(fake), clock });
  await app.ready();
  return {
    app,
    db: dbh.db,
    fake,
    bus: app.bus,
    config,
    clock,
    close: async () => {
      await app.close();
      await dbh.close();
    },
  };
}
