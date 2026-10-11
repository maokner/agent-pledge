/**
 * Runs the PRD 5.4 ledger sequence on XRPL testnet with a self-issued stand-in token.
 *
 *   pnpm --filter @agent-pledge/ledger demo success
 *   pnpm --filter @agent-pledge/ledger demo failure
 *   pnpm --filter @agent-pledge/ledger demo double-claim
 *   pnpm --filter @agent-pledge/ledger demo failure --live   (real wallets from .env.testnet, real RLUSD)
 *
 * Prints an explorer link and a timing for every transaction, then the final balance of every
 * wallet against the expected values from PRD 2.2 and 2.3. Exits with code 1 on any mismatch.
 * Transactions from different wallets run in parallel where the flow allows it (PRD 11).
 * Transactions from the same wallet never run at the same time. Each NFT and its sell offer are
 * made by one NFTokenMint with Amount (NFTokenMintOffer), which saves one ledger per NFT.
 */
import type { Wallet } from "xrpl";
import {
  AlreadyClaimedError,
  acceptOffer,
  acceptPayoutOffer,
  addIouValues,
  burnNft,
  compareIouValues,
  createPayoutOffer,
  disconnect,
  explorerNftUrl,
  failTask,
  fundSubtask,
  fundTask,
  getTokenBalance,
  mintSubtaskNftWithOffer,
  mintTaskNftWithOffer,
  subtractIouValues,
  transferToken,
  type ClaimResult,
  type OpsContext,
  type SubmittedTx,
} from "../src/index.js";
import { createFixtures, createLiveFixtures, seconds, type Fixtures } from "./fixtures.js";

const MODES = ["success", "failure", "double-claim"] as const;
type Mode = (typeof MODES)[number];

/** Demo money from PRD 2.2: $5 task, $1 pledge, $4 sub-task. */
const PRICE = "5";
const PLEDGE = "1";
const SUBTASK_PRICE = "4";
const AGENT_PAYOUT = addIouValues(PRICE, PLEDGE);

const log = (line = "") => console.log(line);
const runStart = Date.now();
const elapsed = () => `+${((Date.now() - runStart) / 1000).toFixed(1).padStart(5)}s`;

interface StepRecord {
  label: string;
  hash: string;
  url: string;
  ms: number;
}
const records: StepRecord[] = [];

/** Runs one ledger transaction and prints its explorer link and duration. */
async function step<T extends SubmittedTx>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await run();
  const ms = Date.now() - started;
  records.push({ label, hash: result.hash, url: result.explorerUrl, ms });
  log(
    `${elapsed()}  ${label.padEnd(44)} ${(ms / 1000).toFixed(1).padStart(5)}s  ${result.explorerUrl}`,
  );
  return result;
}

/** Runs independent steps from different wallets at the same time. */
async function parallel<T extends unknown[]>(
  label: string,
  runs: { [K in keyof T]: () => Promise<T[K]> },
): Promise<T> {
  log(`${elapsed()}  [parallel: ${label}]`);
  const started = Date.now();
  const results = (await Promise.all(runs.map((run) => run()))) as T;
  log(`${elapsed()}  [parallel done in ${seconds(started)}]`);
  return results;
}

interface TaskState {
  taskId: string;
  subtaskId: string;
  taskNftId: string;
  subtaskNftId: string;
  subtaskOfferId: string;
}

/** Demo steps 5 to 8: fund, mint, offer, agent claim, sub-task fund, sub-task mint, open offer. */
async function setUpTask(f: Fixtures, ctx: OpsContext): Promise<TaskState> {
  const { vault, requester, agent } = f.wallets;
  const taskId = `demo-${Date.now().toString(36)}`;
  const subtaskId = `${taskId}-s1`;
  const base = f.config.PUBLIC_BASE_URL;
  log(`Task ${taskId}, sub-task ${subtaskId}`);

  // NFTokenMint with Amount makes the NFT and its sell offer in one transaction (NFTokenMintOffer).
  const [, taskNft] = await parallel("requester pays, vault mints", [
    () =>
      step("5. Payment requester -> vault 5", () =>
        fundTask({ requester, vault, amount: PRICE, taskId }, ctx),
      ),
    () =>
      step("5+7. NFTokenMint task NFT + offer 1, agent only", () =>
        mintTaskNftWithOffer(
          {
            vault,
            uri: `${base}/api/nft/tasks/${taskId}`,
            taskId,
            pledgeAmount: PLEDGE,
            agentAddress: agent.classicAddress,
          },
          ctx,
        ),
      ),
  ]);
  await step("7. NFTokenAcceptOffer by agent (claim)", () =>
    acceptOffer({ claimer: agent, offerId: taskNft.offerId, kind: "task.claim", taskId }, ctx),
  );
  const [, subtaskNft] = await parallel("agent pays, vault mints", [
    () =>
      step("8. Payment agent -> vault 4", () =>
        fundSubtask({ agent, vault, amount: SUBTASK_PRICE, subtaskId, taskId }, ctx),
      ),
    () =>
      step("8. NFTokenMint sub-task NFT + open offer 0", () =>
        mintSubtaskNftWithOffer(
          {
            vault,
            uri: `${base}/api/nft/subtasks/${subtaskId}`,
            subtaskId,
            taskId,
            parentNftId: taskNft.nftId,
          },
          ctx,
        ),
      ),
  ]);
  return {
    taskId,
    subtaskId,
    taskNftId: taskNft.nftId,
    subtaskNftId: subtaskNft.nftId,
    subtaskOfferId: subtaskNft.offerId,
  };
}

/** Demo step 13: both payout swaps, then both burns. */
async function payOut(f: Fixtures, ctx: OpsContext, task: TaskState, helper: Wallet) {
  const { vault, agent } = f.wallets;
  const vaultAddress = vault.classicAddress;
  const { taskId, subtaskId } = task;
  const [helperOffer, agentOffer] = await parallel("helper and agent offer NFTs to the vault", [
    () =>
      step("13. NFTokenCreateOffer helper -> vault 4", () =>
        createPayoutOffer(
          {
            holder: helper,
            vaultAddress,
            nftId: task.subtaskNftId,
            amount: SUBTASK_PRICE,
            taskId,
            subtaskId,
          },
          ctx,
        ),
      ),
    () =>
      step("13. NFTokenCreateOffer agent -> vault 6", () =>
        createPayoutOffer(
          { holder: agent, vaultAddress, nftId: task.taskNftId, amount: AGENT_PAYOUT, taskId },
          ctx,
        ),
      ),
  ]);
  // Vault transactions: one after another.
  await step("13. NFTokenAcceptOffer by vault (helper +4)", () =>
    acceptPayoutOffer(
      {
        vault,
        offerId: helperOffer.offerId,
        nftId: task.subtaskNftId,
        holderAddress: helper.classicAddress,
        amount: SUBTASK_PRICE,
        taskId,
        subtaskId,
      },
      ctx,
    ),
  );
  await step("13. NFTokenAcceptOffer by vault (agent +6)", () =>
    acceptPayoutOffer(
      {
        vault,
        offerId: agentOffer.offerId,
        nftId: task.taskNftId,
        holderAddress: agent.classicAddress,
        amount: AGENT_PAYOUT,
        taskId,
      },
      ctx,
    ),
  );
  await step("13. NFTokenBurn sub-task NFT", () =>
    burnNft({ vault, nftId: task.subtaskNftId, taskId, subtaskId }, ctx),
  );
  await step("13. NFTokenBurn task NFT", () =>
    burnNft({ vault, nftId: task.taskNftId, taskId }, ctx),
  );
}

async function runSuccess(f: Fixtures, ctx: OpsContext): Promise<Expected> {
  const helper = f.wallets.helpers[0] as Wallet;
  const task = await setUpTask(f, ctx);
  printNfts(f, task);
  await step("10. NFTokenAcceptOffer by helper (claim)", () =>
    acceptOffer(
      {
        claimer: helper,
        offerId: task.subtaskOfferId,
        kind: "subtask.claim",
        taskId: task.taskId,
        subtaskId: task.subtaskId,
      },
      ctx,
    ),
  );
  await payOut(f, ctx, task, helper);
  return { requester: "-5", agent: "+1", helper1: "+4", vault: "0" };
}

async function runFailure(f: Fixtures, ctx: OpsContext): Promise<Expected> {
  const { vault, requester, agent } = f.wallets;
  const helper = f.wallets.helpers[0] as Wallet;
  const task = await setUpTask(f, ctx);
  printNfts(f, task);
  // PRD 2.3, second row: a helper claims but never gets the PIN. The vault burns the NFT anyway.
  await step("10. NFTokenAcceptOffer by helper (claim)", () =>
    acceptOffer(
      {
        claimer: helper,
        offerId: task.subtaskOfferId,
        kind: "subtask.claim",
        taskId: task.taskId,
        subtaskId: task.subtaskId,
      },
      ctx,
    ),
  );
  const input = {
    vault,
    taskId: task.taskId,
    taskNftId: task.taskNftId,
    requesterAddress: requester.classicAddress,
    price: PRICE,
    pledge: PLEDGE,
    agentAddress: agent.classicAddress,
    subtasks: [
      {
        subtaskId: task.subtaskId,
        nftId: task.subtaskNftId,
        amount: SUBTASK_PRICE,
        helperAddress: helper.classicAddress,
      },
    ],
  };
  log(`${elapsed()}  Failure: failTask (first call)`);
  let started = Date.now();
  const first = await failTask(input, ctx);
  for (const tx of [...first.burns, ...first.refunds]) {
    records.push({ label: tx.label, hash: tx.hash, url: tx.explorerUrl, ms: 0 });
    log(`${elapsed()}    ${tx.label}`);
    log(`${elapsed()}      ${tx.explorerUrl}`);
  }
  log(
    `${elapsed()}    first call: ${first.burns.length} burns, ${first.refunds.length} refunds in ${seconds(started)}`,
  );
  if (first.burns.length !== 2 || first.refunds.length !== 2)
    fail("first failTask call should burn 2 and refund 2");

  log(`${elapsed()}  Failure: failTask again (must do nothing)`);
  started = Date.now();
  const second = await failTask(input, ctx);
  for (const line of second.skipped) log(`${elapsed()}    skipped: ${line}`);
  log(
    `${elapsed()}    second call: ${second.burns.length} burns, ${second.refunds.length} refunds in ${seconds(started)}`,
  );
  if (second.burns.length + second.refunds.length !== 0)
    fail("second failTask call sent transactions");
  return { requester: "+1", agent: "-1", helper1: "0", vault: "0" };
}

async function runDoubleClaim(f: Fixtures, ctx: OpsContext): Promise<Expected> {
  const [helper1, helper2] = f.wallets.helpers as [Wallet, Wallet];
  const task = await setUpTask(f, ctx);
  printNfts(f, task);
  log(`${elapsed()}  [parallel: helper1 and helper2 both claim the sub-task]`);
  const started = Date.now();
  const claim = (claimer: Wallet) =>
    acceptOffer(
      {
        claimer,
        offerId: task.subtaskOfferId,
        kind: "subtask.claim",
        taskId: task.taskId,
        subtaskId: task.subtaskId,
      },
      ctx,
    );
  const outcomes = await Promise.allSettled([claim(helper1), claim(helper2)]);
  log(`${elapsed()}  [both claims settled in ${seconds(started)}]`);

  let winner: Wallet | undefined;
  let alreadyClaimed = 0;
  outcomes.forEach((outcome, index) => {
    const name = `helper${index + 1}`;
    const wallet = index === 0 ? helper1 : helper2;
    if (outcome.status === "fulfilled") {
      winner = wallet;
      const tx: ClaimResult = outcome.value;
      records.push({
        label: `10. claim by ${name} (won)`,
        hash: tx.hash,
        url: tx.explorerUrl,
        ms: 0,
      });
      log(`${elapsed()}    ${`${name}: tesSUCCESS, holds the NFT`.padEnd(52)} ${tx.explorerUrl}`);
      return;
    }
    // The loser gets tecOBJECT_NOT_FOUND if its tx validates after the winner. If it never
    // validates, the submit throws without a result code. Both mean "Already claimed".
    const error = outcome.reason as Error;
    if (error instanceof AlreadyClaimedError) {
      alreadyClaimed++;
      const hash = (error.cause as { result?: { hash?: string } } | undefined)?.result?.hash;
      const url = hash ? `${f.config.XRPL_EXPLORER_URL}/transactions/${hash}` : "(no hash)";
      if (hash) records.push({ label: `10. claim by ${name} (lost)`, hash, url, ms: 0 });
      log(
        `${elapsed()}    ${`${name}: AlreadyClaimedError (tecOBJECT_NOT_FOUND)`.padEnd(52)} ${url}`,
      );
    } else {
      log(`${elapsed()}    ${name}: lost without a result code: ${error.name}: ${error.message}`);
    }
  });
  const winners = outcomes.filter((o) => o.status === "fulfilled").length;
  if (winners !== 1) fail(`expected exactly 1 winning claim, got ${winners}`);
  if (alreadyClaimed !== 1)
    log("    note: the losing claim did not validate, so it has no AlreadyClaimedError");
  const won = winner as Wallet;
  await payOut(f, ctx, task, won);
  return won === helper1
    ? { requester: "-5", agent: "+1", helper1: "+4", helper2: "0", vault: "0" }
    : { requester: "-5", agent: "+1", helper1: "0", helper2: "+4", vault: "0" };
}

function printNfts(f: Fixtures, task: TaskState) {
  log(`             task NFT     ${explorerNftUrl(f.config, task.taskNftId)}`);
  log(`             sub-task NFT ${explorerNftUrl(f.config, task.subtaskNftId)}`);
}

/** Expected change of the token balance per role over the run, as "+4", "-5", or "0". */
type Expected = Record<string, string>;

function applyDelta(start: string, delta: string): string {
  if (delta.startsWith("-")) return subtractIouValues(start, delta.slice(1));
  return addIouValues(start, delta.replace(/^\+/, ""));
}

function walletRows(f: Fixtures): [string, Wallet][] {
  const { wallets } = f;
  return [
    ["requester", wallets.requester],
    ["agent", wallets.agent],
    ...wallets.helpers.map((w, i): [string, Wallet] => [`helper${i + 1}`, w]),
    ["vault", wallets.vault],
    ...(wallets.issuer ? [["issuer", wallets.issuer] as [string, Wallet]] : []),
  ];
}

async function readBalances(f: Fixtures): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    walletRows(f).map(async ([role, w]) => {
      out[role] = await getTokenBalance(f.client, f.config, w.classicAddress);
    }),
  );
  return out;
}

function tokenName(f: Fixtures): string {
  const code = f.config.XRPL_TOKEN_CURRENCY;
  if (code.length !== 40) return code;
  return Buffer.from(code, "hex").toString("ascii").replace(/\0+$/, "");
}

let mismatches = 0;
function fail(message: string) {
  mismatches++;
  log(`FAIL: ${message}`);
}

async function printBalances(f: Fixtures, starts: Record<string, string>, expected: Expected) {
  const { client, config } = f;
  const rows = walletRows(f);
  log();
  log(`Final balances (token ${tokenName(f)}, issuer ${config.XRPL_TOKEN_ISSUER})`);
  log(
    `${"role".padEnd(10)} ${"address".padEnd(35)} ${"start".padStart(6)} ${"token".padStart(7)} ${"expected".padStart(8)} ${"XRP".padStart(12)} ${"NFTs".padStart(4)}  check`,
  );
  for (const [role, wallet] of rows) {
    const address = wallet.classicAddress;
    const [token, xrp, nfts] = await Promise.all([
      getTokenBalance(client, config, address),
      client.getXrpBalance(address),
      client.request({ command: "account_nfts", account: address, ledger_index: "validated" }),
    ]);
    const start = starts[role] ?? "0";
    const delta = expected[role];
    const want = delta === undefined ? undefined : applyDelta(start, delta);
    const nftCount = nfts.result.account_nfts.length;
    let check = "-";
    if (want !== undefined) {
      const ok = compareIouValues(token, want) === 0 && nftCount === 0;
      check = ok ? "OK" : "MISMATCH";
      if (!ok) fail(`${role} has ${token} and ${nftCount} NFTs, expected ${want} and 0 NFTs`);
    }
    log(
      `${role.padEnd(10)} ${address.padEnd(35)} ${(role === "issuer" ? "-" : start).padStart(6)} ${(role === "issuer" ? "-" : token).padStart(7)} ${(want ?? "-").padStart(8)} ${String(xrp).padStart(12)} ${String(nftCount).padStart(4)}  ${check}`,
    );
  }
}

/** Live mode only: send any token a helper earned back to the requester, so real RLUSD is not stranded in throwaway helper wallets. */
async function sweepHelpers(f: Fixtures, ctx: OpsContext) {
  for (const [i, helper] of f.wallets.helpers.entries()) {
    const balance = await getTokenBalance(f.client, f.config, helper.classicAddress);
    if (compareIouValues(balance, "0") === 0) continue;
    const tx = await transferToken(
      { from: helper, to: f.wallets.requester.classicAddress, amount: balance },
      ctx,
    );
    log(
      `${elapsed()}  sweep: helper${i + 1} returned ${balance} to the requester  ${tx.explorerUrl}`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const mode = args.find((a) => !a.startsWith("--")) as Mode | undefined;
  if (!mode || !MODES.includes(mode)) {
    console.error(`Usage: demo <${MODES.join("|")}> [--live]`);
    process.exit(2);
  }
  log(`Agent Pledge ledger demo: ${mode}${live ? " (live wallets, real token)" : ""}`);
  log(live ? "Live wallets:" : "Fixtures:");
  const helperCount = mode === "double-claim" ? 2 : 1;
  const fixtures = live
    ? await createLiveFixtures({ helperCount, log })
    : await createFixtures({ helperCount, log });
  const starts = await readBalances(fixtures);
  log(
    `  starting balances: ${Object.entries(starts)
      .map(([r, b]) => `${r} ${b}`)
      .join(", ")}`,
  );
  const ctx: OpsContext = { client: fixtures.client, config: fixtures.config };
  log(
    `  token issuer ${fixtures.config.XRPL_TOKEN_ISSUER}, vault ${fixtures.wallets.vault.classicAddress}`,
  );
  log();
  const flowStart = Date.now();
  const expected =
    mode === "success"
      ? await runSuccess(fixtures, ctx)
      : mode === "failure"
        ? await runFailure(fixtures, ctx)
        : await runDoubleClaim(fixtures, ctx);
  log(`${elapsed()}  flow finished: ${records.length} transactions in ${seconds(flowStart)}`);
  await printBalances(fixtures, starts, expected);
  if (live) await sweepHelpers(fixtures, ctx);
  log();
  log(mismatches === 0 ? `PASS: ${mode}` : `FAIL: ${mode} (${mismatches} problems)`);
  await disconnect();
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch(async (error: unknown) => {
  console.error(error);
  await disconnect().catch(() => undefined);
  process.exit(1);
});
