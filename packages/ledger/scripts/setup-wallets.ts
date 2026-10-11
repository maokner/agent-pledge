/**
 * Creates the demo wallets on XRPL testnet (issue #1).
 *
 *   pnpm --filter @agent-pledge/ledger run setup                # RLUSD via tryrlusd.com, else self-issue
 *   pnpm --filter @agent-pledge/ledger run setup --rlusd        # RLUSD only, no fallback
 *   pnpm --filter @agent-pledge/ledger run setup --self-issue   # own test token, skip RLUSD
 *   pnpm --filter @agent-pledge/ledger run setup --out ../../.env.testnet --force
 *
 * Options: --amount N (token per funded wallet, default 100), --currency CODE (self-issue, default
 * USD), --out FILE (default packages/ledger/.env.testnet), --force (overwrite FILE), --print-seeds.
 *
 * The env block with the seeds goes only to the file, with mode 600. The script refuses to overwrite
 * an existing file without --force, and checks this before it spends faucet funds. It writes the file
 * as soon as the wallets exist and again after each step, and also when a later step fails, so the
 * faucet XRP and any token are never stranded. Stdout gets only addresses and explorer links, unless
 * --print-seeds. Progress goes to stderr. Never commit the file.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { AccountSetAsfFlags, type Client, type Wallet } from "xrpl";
import {
  createFundedWallet,
  disconnect,
  ensureTrustLine,
  explorerAccountUrl,
  getClient,
  getTokenBalance,
  isValidCurrencyCode,
  LedgerError,
  ledgerEvents,
  loadConfig,
  submitTx,
  tokenAmount,
  type LedgerConfig,
} from "../src/index.js";
import { checkOutPath, writeEnvFile } from "./env-file.js";

const RLUSD_FAUCET_URL = "https://tryrlusd.com/api/mint-xrpl";
const FAUCET_TIMEOUT_MS = 10_000;

const log = (...parts: unknown[]) => console.error(...parts);

const { values: args } = parseArgs({
  options: {
    "self-issue": { type: "boolean", default: false },
    rlusd: { type: "boolean", default: false },
    amount: { type: "string", default: "100" },
    currency: { type: "string", default: "USD" },
    out: { type: "string" },
    force: { type: "boolean", default: false },
    "print-seeds": { type: "boolean", default: false },
  },
});

if (args["self-issue"] && args.rlusd) throw new Error("Use --self-issue or --rlusd, not both");
if (!isValidCurrencyCode(args.currency)) throw new Error(`Invalid currency code ${args.currency}`);

/** packages/ledger/.env.testnet. The root .gitignore ignores `.env.*`. */
const DEFAULT_OUT = fileURLToPath(new URL("../.env.testnet", import.meta.url));
const outPath = resolve(args.out ?? DEFAULT_OUT);

const outCheck = checkOutPath(outPath, args.force);
if (outCheck.error) {
  log(`${outCheck.error} Nothing was created.`);
  process.exit(1);
}
if (outCheck.warning) log(`WARNING: ${outCheck.warning}`);

ledgerEvents.on("tx.pending", (e) =>
  log(`  pending   ${e.txType} from ${e.account} ${e.explorerUrl}`),
);
ledgerEvents.on("tx.validated", (e) => log(`  validated ${e.txType} in ledger ${e.ledgerIndex}`));
ledgerEvents.on("tx.failed", (e) => log(`  failed    ${e.txType}: ${e.code} (${e.message})`));
ledgerEvents.on("tx.unknown", (e) => log(`  unknown   ${e.txType}: ${e.message} ${e.explorerUrl}`));

interface Wallets {
  vault: Wallet;
  agent: Wallet;
  requester: Wallet;
}

/**
 * Asks tryrlusd.com for 10 testnet RLUSD. Its API needs a GitHub login session, so this only works
 * with TRYRLUSD_SESSION_COOKIE set to the browser's cookie header (for example
 * "__Secure-next-auth.session-token=..."). Returns the faucet tx hash, or throws.
 */
async function claimRlusd(address: string): Promise<string> {
  const cookie = process.env.TRYRLUSD_SESSION_COOKIE;
  const response = await fetch(RLUSD_FAUCET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ address }),
    signal: AbortSignal.timeout(FAUCET_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as { txHash?: string; error?: string };
  if (!response.ok || !body.txHash) {
    throw new Error(`tryrlusd.com answered ${response.status}: ${body.error ?? "no txHash"}`);
  }
  return body.txHash;
}

async function waitForBalance(
  client: Client,
  address: string,
  config: LedgerConfig,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const balance = await getTokenBalance(client, config, address);
    if (Number(balance) > 0 || Date.now() > deadline) return balance;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/** RLUSD path: trust lines, then the web faucet for the requester and the agent. */
async function fundWithRlusd(client: Client, config: LedgerConfig, w: Wallets): Promise<void> {
  log("Setting RLUSD trust lines");
  await Promise.all([w.vault, w.agent, w.requester].map((x) => ensureTrustLine(client, x, config)));
  if (!process.env.TRYRLUSD_SESSION_COOKIE) {
    log("  TRYRLUSD_SESSION_COOKIE is not set. The faucet API needs a GitHub login session.");
  }
  for (const [name, wallet] of [
    ["requester", w.requester],
    ["agent", w.agent],
  ] as const) {
    log(`Asking tryrlusd.com for RLUSD for the ${name}`);
    const hash = await claimRlusd(wallet.classicAddress);
    log(`  faucet tx ${hash}`);
    const balance = await waitForBalance(client, wallet.classicAddress, config);
    if (Number(balance) <= 0) throw new Error(`No RLUSD arrived for the ${name}`);
    log(`  ${name} holds ${balance} RLUSD`);
  }
}

/**
 * Self-issue path (PRD 11): a team issuer account with DefaultRipple, so holders can pay each other,
 * and allowTrustLineLocking, so the token also works with native Token Escrow (XLS-85).
 */
async function selfIssue(
  client: Client,
  config: LedgerConfig,
  w: Wallets,
  issuer: Wallet,
  amount: string,
  currency: string,
): Promise<{ config: LedgerConfig; trustLineLocking: boolean }> {
  const token: LedgerConfig = {
    ...config,
    XRPL_TOKEN_ISSUER: issuer.classicAddress,
    XRPL_TOKEN_CURRENCY: currency,
  };
  const setFlag = (flag: AccountSetAsfFlags) =>
    submitTx(
      client,
      issuer,
      { TransactionType: "AccountSet", Account: issuer.classicAddress, SetFlag: flag },
      { config },
    );
  log("Setting asfDefaultRipple on the issuer");
  await setFlag(AccountSetAsfFlags.asfDefaultRipple);
  let trustLineLocking = false;
  log("Setting asfAllowTrustLineLocking on the issuer");
  try {
    await setFlag(AccountSetAsfFlags.asfAllowTrustLineLocking);
    trustLineLocking = true;
  } catch (error) {
    log(`  could not set allowTrustLineLocking: ${String(error)}. Token Escrow will not work.`);
  }

  log(`Setting ${currency} trust lines`);
  await Promise.all([w.vault, w.agent, w.requester].map((x) => ensureTrustLine(client, x, token)));
  log(`Issuing ${amount} ${currency} to the requester and the agent`);
  await Promise.all(
    [w.requester, w.agent].map((x) =>
      submitTx(
        client,
        issuer,
        {
          TransactionType: "Payment",
          Account: issuer.classicAddress,
          Destination: x.classicAddress,
          Amount: tokenAmount(token, amount),
        },
        { config: token },
      ),
    ),
  );
  return { config: token, trustLineLocking };
}

/** Everything the env file needs. Filled in step by step, so a failure still saves the seeds. */
interface SetupState {
  mode: "rlusd" | "self-issue";
  config: LedgerConfig;
  wallets?: Wallets;
  issuer?: Wallet | undefined;
  trustLineLocking?: boolean;
  balances?: string[];
  testPayment?: string;
  /** Set when a step failed. */
  failure?: string;
}

const state: SetupState = {
  mode: args["self-issue"] ? "self-issue" : "rlusd",
  config: loadConfig(),
};

function envBlock(): string {
  const { config, wallets, issuer, balances, testPayment, failure } = state;
  if (!wallets) return "";
  const line = (name: string, w: Wallet, i: number) =>
    `# ${name.padEnd(9)} ${w.classicAddress}${balances ? ` balance ${balances[i]}` : ""} ${explorerAccountUrl(config, w.classicAddress)}`;
  const lines = [
    `# Agent Pledge testnet wallets, made ${new Date().toISOString()} (${state.mode}). Do not commit.`,
    ...(failure ? [`# SETUP DID NOT FINISH: ${failure.replace(/\s+/g, " ")}`] : []),
    line("vault", wallets.vault, 0),
    line("agent", wallets.agent, 1),
    line("requester", wallets.requester, 2),
    ...(testPayment ? [`# test payment ${testPayment}`] : []),
    `XRPL_NETWORK_URL=${config.XRPL_NETWORK_URL}`,
    `XRPL_EXPLORER_URL=${config.XRPL_EXPLORER_URL}`,
    `XRPL_TOKEN_ISSUER=${config.XRPL_TOKEN_ISSUER}`,
    `XRPL_TOKEN_CURRENCY=${config.XRPL_TOKEN_CURRENCY}`,
    `XRPL_VAULT_SEED=${wallets.vault.seed}`,
    `XRPL_AGENT_SEED=${wallets.agent.seed}`,
    `XRPL_REQUESTER_SEED=${wallets.requester.seed}`,
  ];
  if (issuer) {
    lines.push(
      `# issuer    ${issuer.classicAddress} DefaultRipple=on AllowTrustLineLocking=${state.trustLineLocking ? "on" : "off"}`,
      `XRPL_TOKEN_ISSUER_SEED=${issuer.seed}`,
    );
  }
  return lines.join("\n") + "\n";
}

let written = false;
/** Writes the env block to the file with mode 600. The first write never replaces a file without --force. */
function save(): void {
  const block = envBlock();
  if (!block) return;
  writeEnvFile(outPath, block, written || args.force);
  written = true;
}

/** Addresses and explorer links for stdout. No seeds. */
function summary(): string {
  const { config, wallets, issuer } = state;
  if (!wallets) return "";
  const rows: [string, Wallet][] = [
    ["vault", wallets.vault],
    ["agent", wallets.agent],
    ["requester", wallets.requester],
    ...(issuer ? [["issuer", issuer] as [string, Wallet]] : []),
  ];
  return (
    rows
      .map(
        ([name, w]) =>
          `${name.padEnd(10)} ${w.classicAddress} ${explorerAccountUrl(config, w.classicAddress)}`,
      )
      .join("\n") + "\n"
  );
}

async function main(): Promise<void> {
  const base = state.config;
  const client = await getClient(base);
  log(`Connected to ${base.XRPL_NETWORK_URL}`);

  log("Creating and funding the vault, agent, and requester wallets from the testnet faucet");
  const [vault, agent, requester] = await Promise.all([
    createFundedWallet(client),
    createFundedWallet(client),
    createFundedWallet(client),
  ]);
  state.wallets = { vault, agent, requester };
  save();
  log(`Saved the seeds to ${outPath}`);

  if (state.mode === "rlusd") {
    try {
      await fundWithRlusd(client, base, state.wallets);
    } catch (error) {
      if (args.rlusd) throw error;
      log(`RLUSD faucet failed (${String(error)}). Falling back to a self-issued token.`);
      state.mode = "self-issue";
    }
  }
  if (state.mode === "self-issue") {
    log("Creating the token issuer");
    state.issuer = await createFundedWallet(client);
    save();
    const issued = await selfIssue(
      client,
      base,
      state.wallets,
      state.issuer,
      args.amount,
      args.currency,
    );
    state.config = issued.config;
    state.trustLineLocking = issued.trustLineLocking;
    save();
  }
  const config = state.config;

  log("Test payment: 1 token from the requester to the vault");
  const test = await submitTx(
    client,
    requester,
    {
      TransactionType: "Payment",
      Account: requester.classicAddress,
      Destination: vault.classicAddress,
      Amount: tokenAmount(config, 1),
    },
    { config, taskId: "setup-check" },
  );
  state.testPayment = test.result.hash;
  state.balances = await Promise.all(
    [vault, agent, requester].map((x) => getTokenBalance(client, config, x.classicAddress)),
  );
  save();
}

try {
  await main();
} catch (error) {
  log(error instanceof LedgerError ? `${error.name} ${error.code}: ${error.message}` : error);
  state.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  // Save whatever exists, so funded wallets are never lost, even when a step failed.
  try {
    save();
    if (written) log(`Wrote ${outPath} (mode 600). Load it with: set -a; . ${outPath}; set +a`);
  } catch (error) {
    // The last resort: the seeds are only in memory, so print them rather than lose the wallets.
    log(`Could not write ${outPath}: ${String(error)}. The env block follows on stdout.`);
    args["print-seeds"] = true;
  }
  process.stdout.write(summary());
  if (args["print-seeds"]) process.stdout.write(envBlock());
  await disconnect();
}
