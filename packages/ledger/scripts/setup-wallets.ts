/**
 * Creates the demo wallets on XRPL testnet (issue #1).
 *
 *   pnpm --filter @agent-pledge/ledger setup                 # RLUSD via tryrlusd.com, else self-issue
 *   pnpm --filter @agent-pledge/ledger setup --rlusd         # RLUSD only, no fallback
 *   pnpm --filter @agent-pledge/ledger setup --self-issue    # own test token, skip RLUSD
 *   pnpm --filter @agent-pledge/ledger setup --out ../../.env.testnet
 *
 * Options: --amount N (token per funded wallet, default 100), --currency CODE (self-issue, default USD).
 * Progress goes to stderr. The env block goes to stdout (and to --out, with mode 600), so seeds never
 * mix with logs. Never commit the output.
 */
import { writeFileSync } from "node:fs";
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
  },
});

if (args["self-issue"] && args.rlusd) throw new Error("Use --self-issue or --rlusd, not both");
if (!isValidCurrencyCode(args.currency)) throw new Error(`Invalid currency code ${args.currency}`);

ledgerEvents.on("tx.pending", (e) =>
  log(`  pending   ${e.txType} from ${e.account} ${e.explorerUrl}`),
);
ledgerEvents.on("tx.validated", (e) => log(`  validated ${e.txType} in ledger ${e.ledgerIndex}`));
ledgerEvents.on("tx.failed", (e) => log(`  failed    ${e.txType}: ${e.code} (${e.message})`));

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
    const balance = await getTokenBalance(client, address, config);
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
  amount: string,
  currency: string,
): Promise<{ config: LedgerConfig; issuer: Wallet; trustLineLocking: boolean }> {
  log("Creating the token issuer");
  const issuer = await createFundedWallet(client);
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
  return { config: token, issuer, trustLineLocking };
}

async function main(): Promise<void> {
  const base = loadConfig();
  const client = await getClient(base);
  log(`Connected to ${base.XRPL_NETWORK_URL}`);

  log("Creating and funding the vault, agent, and requester wallets from the testnet faucet");
  const [vault, agent, requester] = await Promise.all([
    createFundedWallet(client),
    createFundedWallet(client),
    createFundedWallet(client),
  ]);
  const wallets: Wallets = { vault, agent, requester };

  let config = base;
  let issuer: Wallet | undefined;
  let mode: "rlusd" | "self-issue" = args["self-issue"] ? "self-issue" : "rlusd";
  let trustLineLocking = false;
  if (mode === "rlusd") {
    try {
      await fundWithRlusd(client, base, wallets);
    } catch (error) {
      if (args.rlusd) throw error;
      log(`RLUSD faucet failed (${String(error)}). Falling back to a self-issued token.`);
      mode = "self-issue";
    }
  }
  if (mode === "self-issue") {
    ({ config, issuer, trustLineLocking } = await selfIssue(
      client,
      base,
      wallets,
      args.amount,
      args.currency,
    ));
  }

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

  const balances = await Promise.all(
    [vault, agent, requester].map((x) => getTokenBalance(client, x.classicAddress, config)),
  );
  const lines = [
    `# Agent Pledge testnet wallets, made ${new Date().toISOString()} (${mode}). Do not commit.`,
    `# vault     ${vault.classicAddress} balance ${balances[0]} ${explorerAccountUrl(config, vault.classicAddress)}`,
    `# agent     ${agent.classicAddress} balance ${balances[1]} ${explorerAccountUrl(config, agent.classicAddress)}`,
    `# requester ${requester.classicAddress} balance ${balances[2]} ${explorerAccountUrl(config, requester.classicAddress)}`,
    `# test payment ${test.result.hash}`,
    `XRPL_NETWORK_URL=${config.XRPL_NETWORK_URL}`,
    `XRPL_EXPLORER_URL=${config.XRPL_EXPLORER_URL}`,
    `XRPL_TOKEN_ISSUER=${config.XRPL_TOKEN_ISSUER}`,
    `XRPL_TOKEN_CURRENCY=${config.XRPL_TOKEN_CURRENCY}`,
    `XRPL_VAULT_SEED=${vault.seed}`,
    `XRPL_AGENT_SEED=${agent.seed}`,
    `XRPL_REQUESTER_SEED=${requester.seed}`,
  ];
  if (issuer) {
    lines.push(
      `# issuer    ${issuer.classicAddress} DefaultRipple=on AllowTrustLineLocking=${trustLineLocking ? "on" : "off"}`,
      `XRPL_TOKEN_ISSUER_SEED=${issuer.seed}`,
    );
  }
  const block = lines.join("\n") + "\n";
  process.stdout.write(block);
  if (args.out) {
    writeFileSync(args.out, block, { mode: 0o600 });
    log(`Wrote ${args.out}`);
  }
}

try {
  await main();
} catch (error) {
  log(error instanceof LedgerError ? `${error.name} ${error.code}: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  await disconnect();
}
