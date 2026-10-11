import { describe, expect, it } from "vitest";
import { Wallet, type IssuedCurrencyAmount } from "xrpl";
import { FundingMismatchError, LedgerError } from "../../errors.js";
import { buildMemos } from "../../memo.js";
import { acceptOffer } from "../claim.js";
import { failTask, planFailTask, vaultStateFromHistory, type FailTaskInput } from "../fail.js";
import { acceptPayoutOffer, createPayoutOffer, redeem } from "../payout.js";
import { listCompleteAccountHistory } from "../state.js";
import { fundSubtask, mintSubtaskNft, offerSubtaskToAnyone } from "../subtask.js";
import { fundTask, mintTaskNft, offerTaskToAgent } from "../task.js";
import { FakeLedger, type Tx } from "./fake-ledger.js";

const vault = Wallet.generate();
const requester = Wallet.generate();
const agent = Wallet.generate();
const helper = Wallet.generate();
const URI = "https://board.example/api/nft/x";

interface Setup {
  /** Stop after this step. Default: everything, up to the helper's claim. */
  until?: "fund" | "claim" | "subtask.fund" | "helper.claim";
  /** Skip the sub-task funding payment, as if it failed. */
  skipSubtaskFund?: boolean;
}

/** Runs the real ops (demo steps 5 to 10) against the fake ledger. */
async function setUpTask(ledger: FakeLedger, setup: Setup = {}) {
  const ctx = ledger.ctx;
  const until = setup.until ?? "helper.claim";
  const taskId = "t1";
  const subtaskId = "t1-s1";
  await fundTask({ requester, vault, amount: "5", taskId }, ctx);
  const taskNft = await mintTaskNft({ vault, uri: URI, taskId }, ctx);
  const ids = {
    taskId,
    subtaskId,
    taskNftId: taskNft.nftId,
    subtaskNftId: undefined as string | undefined,
  };
  if (until === "fund") return ids;
  const offer = await offerTaskToAgent(
    { vault, nftId: taskNft.nftId, pledgeAmount: "1", agentAddress: agent.classicAddress, taskId },
    ctx,
  );
  await acceptOffer({ claimer: agent, offerId: offer.offerId, taskId }, ctx);
  if (until === "claim") return ids;
  if (!setup.skipSubtaskFund) {
    await fundSubtask({ agent, vault, amount: "4", subtaskId, taskId }, ctx);
  }
  const subNft = await mintSubtaskNft(
    { vault, uri: URI, subtaskId, taskId, parentNftId: taskNft.nftId },
    ctx,
  );
  ids.subtaskNftId = subNft.nftId;
  if (until === "subtask.fund") return ids;
  const open = await offerSubtaskToAnyone({ vault, nftId: subNft.nftId, subtaskId, taskId }, ctx);
  await acceptOffer(
    { claimer: helper, offerId: open.offerId, kind: "subtask.claim", taskId, subtaskId },
    ctx,
  );
  return ids;
}

function newLedger() {
  const ledger = new FakeLedger();
  ledger.createAccount(vault.classicAddress);
  return ledger;
}

function inputFor(ids: Awaited<ReturnType<typeof setUpTask>>): FailTaskInput {
  return {
    vault,
    taskId: ids.taskId,
    taskNftId: ids.taskNftId,
    requesterAddress: requester.classicAddress,
    price: "5",
    pledge: "1",
    agentAddress: agent.classicAddress,
    subtasks: [
      {
        subtaskId: ids.subtaskId,
        nftId: ids.subtaskNftId,
        amount: "4",
        helperAddress: helper.classicAddress,
      },
    ],
  };
}

/** Transactions submitted after `from`. */
function since(ledger: FakeLedger, from: number) {
  return ledger.submitted.slice(from);
}

function payments(txs: Tx[]) {
  return txs
    .filter((tx) => tx.TransactionType === "Payment")
    .map((tx) => ({ to: tx.Destination, value: (tx.Amount as IssuedCurrencyAmount).value }));
}

async function readState(ledger: FakeLedger) {
  const history = await listCompleteAccountHistory(ledger.ctx.client, vault.classicAddress);
  return vaultStateFromHistory(vault.classicAddress, history, ledger.config);
}

describe("failTask", () => {
  it("burns both NFTs from their holders, then refunds the requester and the agent", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const start = ledger.submitted.length;
    const result = await failTask(inputFor(ids), ledger.ctx);

    const sent = since(ledger, start);
    expect(sent.map((tx) => tx.TransactionType)).toEqual([
      "NFTokenBurn",
      "NFTokenBurn",
      "Payment",
      "Payment",
    ]);
    expect(sent[0]).toMatchObject({ NFTokenID: ids.taskNftId, Owner: agent.classicAddress });
    expect(sent[1]).toMatchObject({ NFTokenID: ids.subtaskNftId, Owner: helper.classicAddress });
    expect(payments(sent)).toEqual([
      { to: requester.classicAddress, value: "6" },
      { to: agent.classicAddress, value: "4" },
    ]);
    expect(result.burns.map((b) => b.kind)).toEqual(["nft.burn", "nft.burn"]);
    expect(result.refunds.map((r) => r.label)).toEqual([
      `refund 6 (price + pledge) to requester ${requester.classicAddress}`,
      `refund 4 (sub-task t1-s1) to agent ${agent.classicAddress}`,
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("does nothing on a second call", async () => {
    const ledger = newLedger();
    const input = inputFor(await setUpTask(ledger));
    await failTask(input, ledger.ctx);
    const before = ledger.submitted.length;

    const second = await failTask(input, ledger.ctx);
    expect(ledger.submitted.length).toBe(before);
    expect(second.burns).toEqual([]);
    expect(second.refunds).toEqual([]);
    expect(second.skipped).toHaveLength(4);
  });

  it("pays once when two calls run at the same time", async () => {
    const ledger = newLedger();
    const input = inputFor(await setUpTask(ledger));
    const start = ledger.submitted.length;
    await Promise.all([failTask(input, ledger.ctx), failTask(input, ledger.ctx)]);
    expect(payments(since(ledger, start))).toHaveLength(2);
  });

  it("refunds only the price when the agent never claimed", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger, { until: "fund" });
    const start = ledger.submitted.length;
    const result = await failTask(
      {
        vault,
        taskId: ids.taskId,
        taskNftId: ids.taskNftId,
        requesterAddress: requester.classicAddress,
        price: "5",
        pledge: "0",
      },
      ledger.ctx,
    );
    // The vault still holds the task NFT, so it burns it without Owner.
    expect(since(ledger, start)[0]).not.toHaveProperty("Owner");
    expect(payments(since(ledger, start))).toEqual([{ to: requester.classicAddress, value: "5" }]);
    expect(result.refunds).toHaveLength(1);
  });

  it("throws FUNDING_MISMATCH and sends nothing for a pledge that never validated", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger, { until: "fund" });
    const start = ledger.submitted.length;
    const error = await failTask(
      {
        vault,
        taskId: ids.taskId,
        taskNftId: ids.taskNftId,
        requesterAddress: requester.classicAddress,
        price: "5",
        pledge: "1",
      },
      ledger.ctx,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FundingMismatchError);
    expect((error as FundingMismatchError).received).toEqual({
      price: "5",
      pledge: "0",
      subtasks: {},
    });
    expect(since(ledger, start)).toEqual([]);
  });

  it("throws FUNDING_MISMATCH for a sub-task whose funding failed, even with other money in the vault", async () => {
    const ledger = newLedger();
    // Another task's money is in the pooled vault.
    ledger.seed({
      TransactionType: "Payment",
      Account: requester.classicAddress,
      Destination: vault.classicAddress,
      Amount: {
        currency: ledger.config.XRPL_TOKEN_CURRENCY,
        issuer: ledger.config.XRPL_TOKEN_ISSUER,
        value: "50",
      },
      Memos: buildMemos({ task: "other-task", action: "task.fund" }),
    });
    const ids = await setUpTask(ledger, { skipSubtaskFund: true });
    const start = ledger.submitted.length;
    const error = await failTask(inputFor(ids), ledger.ctx).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "FUNDING_MISMATCH" });
    expect((error as FundingMismatchError).problems).toEqual([
      "sub-task t1-s1 from agent: input 4, the vault received 0",
    ]);
    expect(since(ledger, start)).toEqual([]);
  });

  it("throws FUNDING_MISMATCH for a funded sub-task that the input leaves out", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const error = await failTask({ ...inputFor(ids), subtasks: [] }, ledger.ctx).catch(
      (e: unknown) => e,
    );
    expect((error as FundingMismatchError).problems).toEqual([
      "sub-task t1-s1: not in the input, the vault received 4",
    ]);
  });

  it("finishes a partly done failure without repeating the done steps", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const input = inputFor(ids);
    // An earlier process burned the task NFT and refunded the requester, then stopped.
    ledger.external({
      TransactionType: "NFTokenBurn",
      Account: vault.classicAddress,
      NFTokenID: ids.taskNftId,
      Owner: agent.classicAddress,
    });
    ledger.external({
      TransactionType: "Payment",
      Account: vault.classicAddress,
      Destination: requester.classicAddress,
      Amount: {
        currency: ledger.config.XRPL_TOKEN_CURRENCY,
        issuer: ledger.config.XRPL_TOKEN_ISSUER,
        value: "6",
      },
      Memos: buildMemos({ task: "t1", action: "refund" }),
    });
    const start = ledger.submitted.length;
    const result = await failTask(input, ledger.ctx);
    expect(since(ledger, start).map((tx) => tx.TransactionType)).toEqual([
      "NFTokenBurn",
      "Payment",
    ]);
    expect(payments(since(ledger, start))).toEqual([{ to: agent.classicAddress, value: "4" }]);
    expect(result.skipped).toHaveLength(2);
  });

  it("never resends a refund that is deep in the history, across account_tx pages", async () => {
    const ledger = newLedger();
    ledger.maxPageSize = 2;
    const ids = await setUpTask(ledger, { until: "fund" });
    const input: FailTaskInput = {
      vault,
      taskId: ids.taskId,
      requesterAddress: requester.classicAddress,
      price: "5",
      pledge: "0",
    };
    // The early refund, then much later vault activity for other tasks.
    ledger.external({
      TransactionType: "Payment",
      Account: vault.classicAddress,
      Destination: requester.classicAddress,
      Amount: {
        currency: ledger.config.XRPL_TOKEN_CURRENCY,
        issuer: ledger.config.XRPL_TOKEN_ISSUER,
        value: "5",
      },
      Memos: buildMemos({ task: "t1", action: "refund" }),
    });
    for (let i = 0; i < 7; i++) {
      ledger.seed({
        TransactionType: "NFTokenMint",
        Account: vault.classicAddress,
        Memos: buildMemos({ task: `later-${i}`, action: "task.mint" }),
      });
    }
    const start = ledger.submitted.length;
    const before = ledger.accountTxRequests;
    const result = await failTask({ ...input, taskNftId: ids.taskNftId }, ledger.ctx);
    expect(payments(since(ledger, start))).toEqual([]);
    expect(result.skipped).toContain(
      `refund 5 (price + pledge) to requester ${requester.classicAddress}: already sent`,
    );
    expect(ledger.accountTxRequests - before).toBeGreaterThan(2);
  });

  it("tops up a smaller earlier refund instead of counting it as sent", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger, { until: "claim" });
    ledger.external({
      TransactionType: "Payment",
      Account: vault.classicAddress,
      Destination: requester.classicAddress,
      Amount: {
        currency: ledger.config.XRPL_TOKEN_CURRENCY,
        issuer: ledger.config.XRPL_TOKEN_ISSUER,
        value: "1",
      },
      Memos: buildMemos({ task: "t1", action: "refund" }),
    });
    const start = ledger.submitted.length;
    const result = await failTask(
      {
        vault,
        taskId: ids.taskId,
        taskNftId: ids.taskNftId,
        requesterAddress: requester.classicAddress,
        price: "5",
        pledge: "1",
        agentAddress: agent.classicAddress,
      },
      ledger.ctx,
    );
    expect(payments(since(ledger, start))).toEqual([{ to: requester.classicAddress, value: "5" }]);
    expect(result.refunds[0]!.label).toBe(
      `refund 5 of 6 (price + pledge) to requester ${requester.classicAddress}, 1 already sent`,
    );
  });

  it("does not count a refund for another task, a failed refund, or an XRP refund", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const token = {
      currency: ledger.config.XRPL_TOKEN_CURRENCY,
      issuer: ledger.config.XRPL_TOKEN_ISSUER,
      value: "6",
    };
    ledger.seed(
      {
        TransactionType: "Payment",
        Account: vault.classicAddress,
        Destination: requester.classicAddress,
        Amount: token,
        Memos: buildMemos({ task: "other-task", action: "refund" }),
      },
      { delivered_amount: token },
    );
    ledger.seed(
      {
        TransactionType: "Payment",
        Account: vault.classicAddress,
        Destination: requester.classicAddress,
        Amount: token,
        Memos: buildMemos({ task: "t1", action: "refund" }),
      },
      { TransactionResult: "tecPATH_DRY" },
    );
    ledger.seed(
      {
        TransactionType: "Payment",
        Account: vault.classicAddress,
        Destination: requester.classicAddress,
        Amount: "6000000",
        Memos: buildMemos({ task: "t1", action: "refund" }),
      },
      { delivered_amount: "6000000" },
    );
    const start = ledger.submitted.length;
    await failTask(inputFor(ids), ledger.ctx);
    expect(payments(since(ledger, start))).toEqual([
      { to: requester.classicAddress, value: "6" },
      { to: agent.classicAddress, value: "4" },
    ]);
  });

  it("counts only what a partial payment delivered", async () => {
    const ledger = newLedger();
    const delivered = {
      currency: ledger.config.XRPL_TOKEN_CURRENCY,
      issuer: ledger.config.XRPL_TOKEN_ISSUER,
      value: "2",
    };
    ledger.seed(
      {
        TransactionType: "Payment",
        Account: requester.classicAddress,
        Destination: vault.classicAddress,
        Amount: { ...delivered, value: "5" },
        Flags: 0x00020000,
        Memos: buildMemos({ task: "t1", action: "task.fund" }),
      },
      { delivered_amount: delivered },
    );
    const state = await readState(ledger);
    expect(state.deposits).toMatchObject([{ kind: "task.fund", value: "2" }]);
  });

  it("refuses to refund a task whose NFT the vault already bought back in a payout", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    await redeem(
      {
        holder: helper,
        vault,
        nftId: ids.subtaskNftId!,
        amount: "4",
        taskId: "t1",
        subtaskId: "t1-s1",
      },
      ledger.ctx,
    );
    const start = ledger.submitted.length;
    await expect(failTask(inputFor(ids), ledger.ctx)).rejects.toMatchObject({
      code: "ALREADY_PAID_OUT",
    });
    expect(since(ledger, start)).toEqual([]);
  });

  it("aborts with ALREADY_PAID_OUT, not a refund, when a payout validates before its burn (tecNO_ENTRY)", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const offer = await createPayoutOffer(
      { holder: helper, vaultAddress: vault.classicAddress, nftId: ids.subtaskNftId!, amount: "4" },
      ledger.ctx,
    );
    // Another process accepts the payout after failTask read the history, before its burn.
    ledger.beforeSubmit = (tx) => {
      if (tx.TransactionType === "NFTokenBurn" && tx.NFTokenID === ids.subtaskNftId) {
        ledger.beforeSubmit = undefined;
        ledger.external({
          TransactionType: "NFTokenAcceptOffer",
          Account: vault.classicAddress,
          NFTokenSellOffer: offer.offerId,
        });
      }
    };
    const start = ledger.submitted.length;
    const error = await failTask(inputFor(ids), ledger.ctx).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "ALREADY_PAID_OUT" });
    const sent = since(ledger, start);
    expect(payments(sent)).toEqual([]);
    expect(sent.map((tx) => tx.TransactionType)).toEqual(["NFTokenBurn", "NFTokenBurn"]);
  });

  it("aborts with ALREADY_PAID_OUT when a payout moves the NFT to the vault before the holder lookup", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const offer = await createPayoutOffer(
      { holder: helper, vaultAddress: vault.classicAddress, nftId: ids.subtaskNftId!, amount: "4" },
      ledger.ctx,
    );
    // The payout lands right after the first burn: the vault now holds the sub-task NFT, so its
    // burn succeeds. The second history read must still stop the refunds.
    ledger.beforeSubmit = (tx) => {
      if (tx.TransactionType === "NFTokenBurn" && tx.NFTokenID === ids.taskNftId) {
        ledger.beforeSubmit = undefined;
        ledger.external({
          TransactionType: "NFTokenAcceptOffer",
          Account: vault.classicAddress,
          NFTokenSellOffer: offer.offerId,
        });
      }
    };
    const start = ledger.submitted.length;
    await expect(failTask(inputFor(ids), ledger.ctx)).rejects.toMatchObject({
      code: "ALREADY_PAID_OUT",
    });
    expect(payments(since(ledger, start))).toEqual([]);
  });

  it("serializes redeem and failTask of the same task, so only one of them moves money", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const start = ledger.submitted.length;
    const [payout, failure] = await Promise.allSettled([
      redeem(
        {
          holder: helper,
          vault,
          nftId: ids.subtaskNftId!,
          amount: "4",
          taskId: "t1",
          subtaskId: "t1-s1",
        },
        ledger.ctx,
      ),
      failTask(inputFor(ids), ledger.ctx),
    ]);
    expect(payout.status).toBe("fulfilled");
    expect(failure).toMatchObject({ status: "rejected", reason: { code: "ALREADY_PAID_OUT" } });
    expect(payments(since(ledger, start))).toEqual([]);
  });

  it("makes a later payout fail after failTask burned the NFT", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const [failure, payout] = await Promise.allSettled([
      failTask(inputFor(ids), ledger.ctx),
      redeem(
        {
          holder: helper,
          vault,
          nftId: ids.subtaskNftId!,
          amount: "4",
          taskId: "t1",
          subtaskId: "t1-s1",
        },
        ledger.ctx,
      ),
    ]);
    expect(failure.status).toBe("fulfilled");
    expect(payout).toMatchObject({ status: "rejected", reason: { resultCode: "tecNO_ENTRY" } });
  });

  it("throws, and pays nothing, when no candidate holds an NFT that is not burned", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    ledger.holders.set(ids.subtaskNftId!, Wallet.generate().classicAddress);
    const start = ledger.submitted.length;
    await expect(failTask(inputFor(ids), ledger.ctx)).rejects.toMatchObject({
      code: "NFT_HOLDER_UNKNOWN",
    });
    expect(payments(since(ledger, start))).toEqual([]);
  });

  it("throws HISTORY_INCOMPLETE when the server lacks the vault's creation", async () => {
    const ledger = new FakeLedger();
    const ids = await setUpTask(ledger);
    const start = ledger.submitted.length;
    await expect(failTask(inputFor(ids), ledger.ctx)).rejects.toMatchObject({
      code: "HISTORY_INCOMPLETE",
    });
    expect(since(ledger, start)).toEqual([]);
  });

  it("rethrows tecNO_ENTRY when the NFT was neither burned nor paid out", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    ledger.nextResults = ["tecNO_ENTRY"];
    const start = ledger.submitted.length;
    await expect(failTask(inputFor(ids), ledger.ctx)).rejects.toMatchObject({
      resultCode: "tecNO_ENTRY",
    });
    expect(payments(since(ledger, start))).toEqual([]);
  });
});

describe("acceptPayoutOffer", () => {
  it("refuses an offer that asks more than expected, and submits nothing", async () => {
    const ledger = newLedger();
    const ids = await setUpTask(ledger);
    const greedy = await createPayoutOffer(
      {
        holder: helper,
        vaultAddress: vault.classicAddress,
        nftId: ids.subtaskNftId!,
        amount: "100",
      },
      ledger.ctx,
    );
    const start = ledger.submitted.length;
    const error = await acceptPayoutOffer(
      {
        vault,
        offerId: greedy.offerId,
        nftId: ids.subtaskNftId!,
        holderAddress: helper.classicAddress,
        amount: "4",
      },
      ledger.ctx,
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "OFFER_MISMATCH" });
    expect((error as LedgerError).message).toContain("Amount is 100, expected 4");
    expect(since(ledger, start)).toEqual([]);
  });
});

describe("planFailTask", () => {
  const empty = vaultStateFromHistory(vault.classicAddress, [], new FakeLedger().config);
  const base: FailTaskInput = {
    vault,
    taskId: "t1",
    requesterAddress: requester.classicAddress,
    price: "0",
    pledge: "0",
  };

  it("burns only minted NFTs and skips a zero refund", () => {
    const plan = planFailTask(base, empty);
    expect(plan.steps).toEqual([]);
    expect(plan.skipped).toEqual([
      `refund 0 (price + pledge) to requester ${requester.classicAddress}: amount is zero`,
    ]);
  });

  it("needs the agent address to refund sub-task money", () => {
    expect(() =>
      planFailTask({ ...base, subtasks: [{ subtaskId: "s", amount: "0" }] }, empty),
    ).toThrow(TypeError);
  });

  it("is a LedgerError for an already paid-out task", () => {
    const nft = "A1".repeat(32);
    const state = { ...empty, paidOutNftIds: new Set([nft]) };
    expect(() => planFailTask({ ...base, taskNftId: nft }, state)).toThrow(LedgerError);
  });

  it("refunds what the vault received, not more", () => {
    const state = {
      ...empty,
      deposits: [
        {
          kind: "task.fund" as const,
          hash: "H",
          from: requester.classicAddress,
          taskId: "t1",
          value: "5",
        },
      ],
    };
    expect(() => planFailTask({ ...base, price: "6" }, state)).toThrow(FundingMismatchError);
    expect(planFailTask({ ...base, price: "5" }, state).steps).toMatchObject([
      { type: "refund", amount: "5" },
    ]);
  });
});
