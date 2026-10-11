import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { createLedger } from "./ledger";
import { startScheduler } from "./services/scheduler";

const config = loadConfig();
const dbh = await createDb(config.DATABASE_URL);
await dbh.migrate();
const ledger = await createLedger(config);
const app = await buildApp({ config, db: dbh.db, ledger });
const stopScheduler = startScheduler(app);

app.addHook("onClose", async () => {
  stopScheduler();
  await ledger.port.close?.();
  await dbh.close();
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    app.log.info({ sig }, "shutting down");
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(
  { db: dbh.driver, ledger: ledger.mode, vault: ledger.vaultAddress, agent: ledger.agentAddress },
  "agent-pledge server ready",
);
