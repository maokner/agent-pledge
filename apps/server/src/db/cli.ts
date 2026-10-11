/**
 * pnpm db:migrate | db:seed | db:reset
 * Note: PGlite on disk allows one process at a time. Stop `pnpm dev` before seeding or resetting.
 */
import { buildApp } from "../app";
import { loadConfig } from "../config";
import { FakeLedger, fakeLedgerHandle } from "../ledger";
import { createDb, wipeDb } from "./client";
import { insertTask } from "./factories";

const cmd = process.argv[2];
const config = loadConfig();
const dbh = await createDb(config.DATABASE_URL);

try {
  if (cmd === "migrate") {
    await dbh.migrate();
    console.log(`migrated (${dbh.driver})`);
  } else if (cmd === "reset") {
    await wipeDb(dbh.db);
    await dbh.migrate();
    console.log(`database wiped and migrated (${dbh.driver})`);
  } else if (cmd === "seed") {
    await dbh.migrate();
    // Seed always uses an instant FakeLedger: the rows look real but no XRPL calls are made.
    const fake = new FakeLedger({ latencyMs: 0, agentAddress: config.AGENT_ADDRESS || undefined });
    const app = await buildApp({
      config: { ...config, LOG_LEVEL: "silent" },
      db: dbh.db,
      ledger: fakeLedgerHandle(fake),
    });
    await app.ready();
    const open = await insertTask(app, {
      status: "open",
      description: "Save a seat by the window",
      place: "Main Stacks, 2nd floor",
    });
    const claimed = await insertTask(app, {
      status: "claimed",
      subtask: "claimed",
      description: "Save a seat at the front table",
      place: "Doe Library, front table",
      price: "6.00",
    });
    const done = await insertTask(app, {
      status: "done",
      description: "Save a seat near the outlets",
      place: "Moffitt, 4th floor",
      price: "5.00",
    });
    const failed = await insertTask(app, {
      status: "failed",
      description: "Save two seats together",
      place: "Main Stacks, B level",
      price: "8.00",
    });
    await app.close();
    console.log("seeded tasks:");
    for (const f of [open, claimed, done, failed]) {
      console.log(
        `  ${f.task.status.padEnd(8)} ${f.task.id}  pin=${f.pin}  subtasks=${f.subtasks.map((s) => `${s.subtask.claimCode}:${s.subtask.status}`).join(",") || "-"}`,
      );
    }
  } else {
    console.error("usage: tsx src/db/cli.ts migrate|seed|reset");
    process.exitCode = 1;
  }
} finally {
  await dbh.close();
}
