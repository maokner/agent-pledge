import {
  AlreadyClaimedError as ContractAlreadyClaimedError,
  LedgerTxFailedError,
  type TxEvent,
} from "@agent-pledge/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { Wallet } from "xrpl";
import { readMemos } from "../memo.js";
import { FakeLedger } from "../ops/__tests__/fake-ledger.js";
import { fundTask } from "../ops/task.js";
import { XrplAgentLedger } from "../port-agent.js";
import { UNKNOWN_PARENT_NFT_ID, XrplLedgerPort } from "../port.js";

const vault = Wallet.generate();
const treasury = Wallet.generate();
const agentWallet = Wallet.generate();
const requester = Wallet.generate();
const helper = Wallet.generate();
const URI = (id: string) => `https://api.example/tasks/${id}.json`;

let ledger: FakeLedger;
let port: XrplLedgerPort;
let agent: XrplAgentLedger;
let events: TxEvent[];
let agentEvents: TxEvent[];

beforeEach(() => {
  ledger = new FakeLedger();
  ledger.createAccount(vault.classicAddress);
  port = new XrplLedgerPort(ledger.ctx, vault, treasury, { verifyTimeoutMs: 50 });
  agent = new XrplAgentLedger(ledger.ctx, agentWallet, vault.classicAddress);
  events = [];
  agentEvents = [];
  port.onTx((e) => events.push(e));
  agent.onTx((e) => agentEvents.push(e));
  return async () => {
    await port.close();
    await agent.close();
  };
});

const statuses = (hash: string, list = events) =>
  list.filter((e) => e.hash === hash).map((e) => e.status);
const last = (hash: string, list = events) => list.filter((e) => e.hash === hash).at(-1)!;

/** Requester funding, task funding, task NFT, offer to the agent. */
async function setUpTask(taskId = "t1") {
  await port.fundRequester(requester.classicAddress, "5.00", { taskId });
  await port.fundTask(requester.seed!, taskId, "5.00");
  const mint = await port.mintTaskNft(taskId, URI(taskId));
  const offer = await port.offerTaskToAgent(mint.nftId, "1.00", agentWallet.classicAddress, taskId);
  return { mint, offer };
}

/** The agent claims, the server verifies; the agent funds a sub-task, the server verifies and mints it. */
async function claimAndSubtask(taskId = "t1", subtaskId = "sub_1") {
  const { mint, offer } = await setUpTask(taskId);
  const claim = await agent.acceptOffer(offer.offerId, { taskId });
  await port.verifyTx(claim.hash, {
    kind: "task_claim",
    offerId: offer.offerId,
    from: agentWallet.classicAddress,
    taskId,
  });
  const funding = await agent.fundSubtask(subtaskId, "4.00", { taskId, subtaskId });
  await port.verifyTx(funding.hash, {
    kind: "subtask_funding",
    from: agentWallet.classicAddress,
    to: vault.classicAddress,
    amount: "4.00",
    memo: subtaskId,
    taskId,
    subtaskId,
  });
  const subMint = await port.mintSubtaskNft(subtaskId, URI(subtaskId));
  const subOffer = await port.offerSubtaskToAnyone(subMint.nftId, subtaskId);
  const helperClaim = await port.acceptOffer(helper.seed!, subOffer.offerId, { taskId, subtaskId });
  return { mint, offer, claim, funding, subMint, subOffer, helperClaim };
}

describe("createXrplLedger port: events", () => {
  it("emits pending then validated with contract kinds, money, and IDs", async () => {
    const { mint, offer } = await setUpTask();
    const kinds = [...new Set(events.map((e) => `${e.kind}`))];
    expect(kinds).toEqual(["requester_funding", "task_funding", "task_nft_mint", "task_offer"]);
    for (const hash of new Set(events.map((e) => e.hash))) {
      expect(statuses(hash)).toEqual(["pending", "validated"]);
    }
    const funding = events.find((e) => e.kind === "requester_funding" && e.status === "validated")!;
    expect(funding).toMatchObject({
      amount: "5.00",
      currency: "RLUSD",
      from: treasury.classicAddress,
      to: requester.classicAddress,
      taskId: "t1",
    });
    expect(funding.explorerUrl).toBe(`https://testnet.xrpl.org/transactions/${funding.hash}`);
    expect(last(mint.hash)).toMatchObject({ status: "validated", nftId: mint.nftId });
    expect(last(offer.hash)).toMatchObject({
      status: "validated",
      offerId: offer.offerId,
      nftId: mint.nftId,
      amount: "1.00",
      to: agentWallet.classicAddress,
    });
    expect(offer.amount).toBe("1.00");
  });

  it("forwards only transactions this port submitted or verified", async () => {
    await fundTask(
      { requester, vault: vault.classicAddress, amount: "1", taskId: "other" },
      ledger.ctx,
    );
    expect(events).toEqual([]);

    const { offer } = await setUpTask();
    const before = events.length;
    const claim = await agent.acceptOffer(offer.offerId, { taskId: "t1" });
    // The agent's own transaction reaches the agent's listeners, not the server port's.
    expect(events.length).toBe(before);
    expect(statuses(claim.hash, agentEvents)).toEqual(["pending", "validated"]);
    expect(last(claim.hash, agentEvents)).toMatchObject({ kind: "task_claim" });

    const verified = await port.verifyTx(claim.hash, {
      kind: "task_claim",
      offerId: offer.offerId,
      from: agentWallet.classicAddress,
      taskId: "t1",
    });
    expect(verified).toMatchObject({ validated: true, kind: "task_claim", nftId: claim.nftId });
    expect(statuses(claim.hash)).toEqual(["validated"]);
    expect(last(claim.hash)).toMatchObject({
      taskId: "t1",
      nftId: claim.nftId,
      offerId: offer.offerId,
    });
  });

  it("emits failed and throws AlreadyClaimedError for an offer that is gone", async () => {
    const { subOffer } = await claimAndSubtask();
    const other = Wallet.generate();
    await expect(
      port.acceptOffer(other.seed!, subOffer.offerId, { taskId: "t1", subtaskId: "sub_1" }),
    ).rejects.toBeInstanceOf(ContractAlreadyClaimedError);
    const failed = events.filter((e) => e.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ kind: "subtask_claim", error: "tecOBJECT_NOT_FOUND" });
  });
});

describe("createXrplLedger port: success flow", () => {
  it("links the sub-task NFT to the task NFT and pays out helper and agent", async () => {
    const { mint, subMint, helperClaim } = await claimAndSubtask();
    const subMintTx = ledger.submitted.find(
      (tx) => tx.TransactionType === "NFTokenMint" && readMemos(tx.Memos).subtask === "sub_1",
    )!;
    expect(readMemos(subMintTx.Memos)).toMatchObject({ task: "t1", parentNft: mint.nftId });
    expect(helperClaim).toMatchObject({ kind: "subtask_claim", holder: helper.classicAddress });
    expect(last(subMint.hash)).toMatchObject({
      kind: "subtask_nft_mint",
      subtaskId: "sub_1",
      taskId: "t1",
    });

    const ctx = { taskId: "t1", subtaskId: "sub_1" };
    const redeem = await port.createRedeemOffer(helper.seed!, subMint.nftId, "4.00", ctx);
    expect(redeem.kind).toBe("helper_redeem_offer");
    const payout = await port.acceptRedeemOffer(redeem.offerId, ctx);
    expect(payout).toMatchObject({
      kind: "helper_payout",
      amount: "4.00",
      to: helper.classicAddress,
    });
    const burn = await port.burn(subMint.nftId, ctx);
    expect(burn.kind).toBe("subtask_nft_burn");

    const offer = await agent.createRedeemOffer(mint.nftId, "6.00", { taskId: "t1" });
    const verified = await port.verifyTx(offer.hash, {
      kind: "agent_redeem_offer",
      nftId: mint.nftId,
      amount: "6.00",
      from: agentWallet.classicAddress,
      taskId: "t1",
    });
    expect(verified.offerId).toBe(offer.offerId);
    const agentPayout = await port.acceptRedeemOffer(offer.offerId, { taskId: "t1" });
    expect(agentPayout).toMatchObject({
      kind: "agent_payout",
      amount: "6.00",
      to: agentWallet.classicAddress,
    });
    const taskBurn = await port.burn(mint.nftId, { taskId: "t1" });
    expect(taskBurn.kind).toBe("task_nft_burn");
    expect(ledger.holders.has(mint.nftId)).toBe(false);
  });

  it("passes ctx.proofSha256 to the helper's offer and the vault's accept as the proof memo", async () => {
    const { subMint } = await claimAndSubtask();
    const proof = "c4".repeat(32);
    const ctx = { taskId: "t1", subtaskId: "sub_1", proofSha256: proof };
    const before = ledger.submitted.length;
    const redeem = await port.createRedeemOffer(helper.seed!, subMint.nftId, "4.00", ctx);
    await port.acceptRedeemOffer(redeem.offerId, ctx);
    const txs = ledger.submitted.slice(before);
    expect(txs.map((tx) => tx.TransactionType)).toEqual([
      "NFTokenCreateOffer",
      "NFTokenAcceptOffer",
    ]);
    expect(txs.map((tx) => readMemos(tx.Memos))).toEqual([
      { task: "t1", subtask: "sub_1", action: "payout.offer", proof },
      { task: "t1", subtask: "sub_1", action: "payout.accept", proof },
    ]);
  });

  it("the agent ledger passes ctx.proofSha256 to its redeem offer", async () => {
    const { mint } = await claimAndSubtask();
    const proof = "d5".repeat(32);
    await agent.createRedeemOffer(mint.nftId, "6.00", { taskId: "t1", proofSha256: proof });
    expect(readMemos(ledger.submitted.at(-1)!.Memos)).toMatchObject({
      action: "payout.offer",
      proof,
    });
  });

  it("rejects a malformed ctx.proofSha256 before it signs", async () => {
    const { subMint } = await claimAndSubtask();
    const before = ledger.submitted.length;
    await expect(
      port.createRedeemOffer(helper.seed!, subMint.nftId, "4.00", {
        taskId: "t1",
        subtaskId: "sub_1",
        proofSha256: "not-a-hash",
      }),
    ).rejects.toBeInstanceOf(LedgerTxFailedError);
    expect(ledger.submitted.length).toBe(before);
  });

  it("writes the placeholder parent when the task NFT is unknown", async () => {
    const mint = await port.mintSubtaskNft("sub_x", URI("sub_x"));
    const tx = ledger.submitted.at(-1)!;
    expect(readMemos(tx.Memos)).toMatchObject({
      subtask: "sub_x",
      parentNft: UNKNOWN_PARENT_NFT_ID,
    });
    expect(readMemos(tx.Memos).task).toBeUndefined();
    expect(mint.kind).toBe("subtask_nft_mint");
  });
});

describe("createXrplLedger port: verifyTx", () => {
  it("rejects a funding with the wrong amount, destination, or memo", async () => {
    const { offer } = await setUpTask();
    const claim = await agent.acceptOffer(offer.offerId, { taskId: "t1" });
    await expect(
      port.verifyTx(claim.hash, { kind: "task_claim", offerId: "0".repeat(64), taskId: "t1" }),
    ).rejects.toBeInstanceOf(LedgerTxFailedError);
    const funding = await agent.fundSubtask("sub_1", "4.00", { taskId: "t1", subtaskId: "sub_1" });
    for (const bad of [{ amount: "3.00" }, { memo: "sub_2" }, { to: requester.classicAddress }]) {
      await expect(
        port.verifyTx(funding.hash, {
          kind: "subtask_funding",
          from: agentWallet.classicAddress,
          amount: "4.00",
          memo: "sub_1",
          ...bad,
        }),
      ).rejects.toThrow(/verifyTx/);
    }
    await expect(
      port.verifyTx(claim.hash, { kind: "subtask_funding", from: agentWallet.classicAddress }),
    ).rejects.toThrow(/transaction type/);
  });

  it("times out with a network error for an unknown hash", async () => {
    await expect(
      port.verifyTx("A".repeat(64), { kind: "task_claim", offerId: "B".repeat(64) }),
    ).rejects.toMatchObject({ code: "network" });
  });
});

describe("createXrplLedger port: failTask", () => {
  it("claimed task: burns both NFTs and refunds price + pledge and the sub-task money", async () => {
    const { mint, subMint } = await claimAndSubtask();
    events.length = 0;
    const input = {
      taskId: "t1",
      taskNftId: mint.nftId,
      subtaskNftIds: [subMint.nftId],
      subtaskIds: ["sub_1"],
      requesterAddress: requester.classicAddress,
      refundToRequester: "6.00",
      agentAddress: agentWallet.classicAddress,
      refundToAgent: "4.00",
    };
    const results = await port.failTask(input);
    expect(results.map((r) => [r.kind, r.amount, r.to])).toEqual([
      ["task_nft_burn", undefined, undefined],
      ["subtask_nft_burn", undefined, undefined],
      ["refund_requester", "6.00", requester.classicAddress],
      ["refund_agent", "4.00", agentWallet.classicAddress],
    ]);
    for (const r of results) expect(statuses(r.hash)).toEqual(["pending", "validated"]);
    expect(last(results[1]!.hash)).toMatchObject({ subtaskId: "sub_1", nftId: subMint.nftId });

    // Idempotent: the same call returns the first results; a fresh port submits nothing.
    expect(await port.failTask(input)).toBe(results);
    const submitted = ledger.submitted.length;
    const restarted = new XrplLedgerPort(ledger.ctx, vault, treasury);
    expect(await restarted.failTask(input)).toEqual([]);
    expect(ledger.submitted.length).toBe(submitted);
    await restarted.close();
  });

  it("unclaimed task: burns the task NFT and refunds the price", async () => {
    const { mint } = await setUpTask();
    const results = await port.failTask({
      taskId: "t1",
      taskNftId: mint.nftId,
      subtaskNftIds: [],
      requesterAddress: requester.classicAddress,
      refundToRequester: "5.00",
      agentAddress: agentWallet.classicAddress,
      refundToAgent: "0.00",
    });
    expect(results.map((r) => [r.kind, r.amount])).toEqual([
      ["task_nft_burn", undefined],
      ["refund_requester", "5.00"],
    ]);
  });
});
