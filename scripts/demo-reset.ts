/**
 * Second half of `pnpm demo:reset` (issue #30). The first half is `pnpm db:reset` (wipe + migrate).
 * This part:
 *   1. prints the vault, agent, and treasury balances (RLUSD and XRP), and warns when one is too low;
 *   2. clears the local agent's state directory on this laptop (tolerates it missing).
 *
 * It reads the same env as the server (apps/server/.env, then the repo-root .env, then the process env).
 * Point DATABASE_URL at Render's EXTERNAL connection string to reset the deployed database (docs/runbook.md).
 *
 * Local agent state: AGENT_STATE_DIR (the local agent's own variable; LOCAL_AGENT_STATE_DIR also works),
 * default apps/local-agent/.data (gitignored by the root .gitignore pattern for .data). The local agent
 * (apps/local-agent, issue #27) keeps its post queue and screenshots there. The chrome-profile folder
 * with our Yik Yak login is kept.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, SERVER_ROOT } from "../apps/server/src/config";
import type { Config } from "../apps/server/src/config";
import { createLedger } from "../apps/server/src/ledger";
import { fromCents, toCents } from "../packages/shared/src/index";

const REPO_ROOT = resolve(SERVER_ROOT, "../..");
const DEMO_RUNS = 2;

interface Balance {
  rlusd: string | null;
  xrp: string | null;
  error?: string;
}

const config = loadConfig();
const warnings: string[] = [];

function row(role: string, address: string | undefined, b: Balance | null) {
  const addr = (address || "(unknown)").padEnd(36);
  if (!b) return console.log(`  ${role.padEnd(9)} ${addr} (no balance query)`);
  if (b.error) return console.log(`  ${role.padEnd(9)} ${addr} error: ${b.error}`);
  console.log(
    `  ${role.padEnd(9)} ${addr} ${String(b.rlusd ?? "-").padStart(12)} RLUSD  ${String(b.xrp ?? "-").padStart(10)} XRP`,
  );
}

function needAtLeast(role: string, b: Balance | null, rlusdCents: number) {
  if (!b || b.error || b.rlusd === null) return;
  if (toCents(Number(b.rlusd).toFixed(2)) < rlusdCents)
    warnings.push(
      `${role} has ${b.rlusd} RLUSD; ${DEMO_RUNS} demo runs need about ${fromCents(rlusdCents)}`,
    );
}

// ---------- XRPL read-only queries (no keys, no library: plain JSON over WebSocket) ----------

function xrplRequest(
  cfg: Config,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(cfg.XRPL_NETWORK_URL);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timeout talking to ${cfg.XRPL_NETWORK_URL}`));
    }, 15_000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ id: 1, ...request })));
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`cannot connect to ${cfg.XRPL_NETWORK_URL}`));
    });
    ws.addEventListener("message", (ev) => {
      clearTimeout(timer);
      ws.close();
      const msg = JSON.parse(String(ev.data)) as {
        status?: string;
        error?: string;
        result?: Record<string, unknown>;
      };
      if (msg.status !== "success" || !msg.result) reject(new Error(msg.error ?? "request failed"));
      else resolvePromise(msg.result);
    });
  });
}

async function xrplBalance(cfg: Config, address: string): Promise<Balance> {
  try {
    const info = await xrplRequest(cfg, {
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });
    const drops = Number((info.account_data as { Balance?: string } | undefined)?.Balance ?? 0);
    const lines = await xrplRequest(cfg, {
      command: "account_lines",
      account: address,
      peer: cfg.RLUSD_ISSUER,
      ledger_index: "validated",
    });
    const line = (lines.lines as { currency: string; balance: string }[] | undefined)?.find(
      (l) => l.currency === cfg.RLUSD_CURRENCY || l.currency === "RLUSD",
    );
    return { xrp: (drops / 1_000_000).toFixed(2), rlusd: line ? line.balance : null };
  } catch (e) {
    return { rlusd: null, xrp: null, error: (e as Error).message };
  }
}

// ---------- 1. balances ----------

async function printBalances() {
  console.log(`\nLedger balances (LEDGER_MODE=${config.LEDGER_MODE}):`);
  const pledge = toCents(config.PLEDGE_AMOUNT);
  // Budget per run: a $10 task at most, so the agent pays pledge + up to $8 of sub-task.
  const agentNeeds = DEMO_RUNS * (pledge + 800);
  const treasuryNeeds = DEMO_RUNS * 1000;

  let ledger;
  try {
    ledger = await createLedger(config);
  } catch (e) {
    warnings.push(`could not create the ledger port: ${(e as Error).message}`);
    if (config.LEDGER_MODE === "xrpl" && config.AGENT_ADDRESS) {
      row("agent", config.AGENT_ADDRESS, await xrplBalance(config, config.AGENT_ADDRESS));
    }
    return;
  }
  try {
    if (ledger.fake) {
      const fake = ledger.fake;
      row("vault", fake.vaultAddress, { rlusd: fake.balanceOf(fake.vaultAddress), xrp: null });
      row("agent", fake.agentAddress, { rlusd: fake.balanceOf(fake.agentAddress), xrp: null });
      row("treasury", fake.treasuryAddress, {
        rlusd: fake.balanceOf(fake.treasuryAddress),
        xrp: null,
      });
      console.log(
        "  Fake ledger: balances live in the server's memory. These are the values a freshly started server has;\n" +
          "  restart the server after this reset so the ledger, the event seq, and the board start clean.",
      );
      return;
    }
    const treasuryAddress =
      (ledger.port as { treasuryAddress?: string }).treasuryAddress ?? process.env.TREASURY_ADDRESS;
    const vault = await xrplBalance(config, ledger.vaultAddress);
    const agent = await xrplBalance(config, ledger.agentAddress);
    const treasury = treasuryAddress ? await xrplBalance(config, treasuryAddress) : null;
    row("vault", ledger.vaultAddress, vault);
    row("agent", ledger.agentAddress, agent);
    row("treasury", treasuryAddress, treasury);
    if (!treasuryAddress) console.log("  (set TREASURY_ADDRESS to also check the treasury)");
    needAtLeast("agent", agent, agentNeeds);
    needAtLeast("treasury", treasury, treasuryNeeds);
    for (const [role, b] of [
      ["vault", vault],
      ["agent", agent],
      ["treasury", treasury],
    ] as const) {
      if (b && !b.error && b.rlusd === null)
        warnings.push(`${role} has no RLUSD trust line to ${config.RLUSD_ISSUER}`);
      if (b && !b.error && b.xrp !== null && Number(b.xrp) < 5)
        warnings.push(
          `${role} has only ${b.xrp} XRP (fees and reserves; refill from the testnet faucet)`,
        );
    }
  } finally {
    await ledger.port.close?.();
  }
}

// ---------- 2. local agent state ----------

// The browser profile holds our Yik Yak login (apps/local-agent/README.md), so a reset keeps it.
const KEEP_IN_AGENT_STATE = new Set(["chrome-profile"]);

function clearLocalAgentState() {
  const dir = resolve(
    REPO_ROOT,
    process.env.AGENT_STATE_DIR || process.env.LOCAL_AGENT_STATE_DIR || "apps/local-agent/.data",
  );
  console.log(`\nLocal agent state: ${dir}`);
  if (!existsSync(dir)) {
    console.log("  not found; nothing to clear");
    return;
  }
  const entries = readdirSync(dir).filter((name) => !KEEP_IN_AGENT_STATE.has(name));
  for (const name of entries) rmSync(resolve(dir, name), { recursive: true, force: true });
  console.log(
    `  cleared ${entries.length} entr${entries.length === 1 ? "y" : "ies"} (kept the Yik Yak browser profile)`,
  );
}

await printBalances();
clearLocalAgentState();

console.log(
  "\nNext: restart the server (Render: Manual Deploy > Restart service), restart the local agent,",
);
console.log(
  "and reload the board. The server's task queue for the agent lives in the database, so it is empty now.",
);
if (warnings.length) {
  console.log("\nWARNINGS:");
  for (const w of warnings) console.log(`  - ${w}`);
  process.exitCode = 1;
} else {
  console.log("\nReset complete. No warnings.");
}
