import { AlreadyClaimedError, LedgerTxFailedError, type TxEvent } from "@agent-pledge/shared";
import { describe, expect, it } from "vitest";
import { FakeLedger } from "../src/ledger/fake";

const HEX64 = /^[0-9A-F]{64}$/;

async function fundedTask(l: FakeLedger, taskId = "task_1") {
  const req = await l.createWallet("requester");
  await l.fundRequester(req.address, "5.00", { taskId });
  await l.fundTask(req.seed, taskId, "5.00");
  const mint = await l.mintTaskNft(taskId, `http://api.test/tasks/${taskId}.json`);
  const offer = await l.offerTaskToAgent(mint.nftId, "1.00", l.agentAddress, taskId);
  return { req, mint, offer };
}

describe("FakeLedger", () => {
  it("emits pending then validated with realistic hashes and explorer URLs", async () => {
    const l = new FakeLedger({ latencyMs: 5 });
    const events: TxEvent[] = [];
    l.onTx((e) => events.push(e));
    const req = await l.createWallet("requester");
    expect(req.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{33}$/);
    const r = await l.fundRequester(req.address, "5.00");
    expect(r.hash).toMatch(HEX64);
    expect(r.explorerUrl).toBe(`https://testnet.xrpl.org/transactions/${r.hash}`);
    const forTx = events.filter((e) => e.hash === r.hash).map((e) => e.status);
    expect(forTx).toEqual(["pending", "validated"]);
    expect(l.balanceOf(req.address)).toBe("5.00");
  });

  it("runs the full success flow with PRD 2.2 balances", async () => {
    const l = new FakeLedger({ latencyMs: 0, agentBalance: "10.00" });
    const { mint, offer } = await fundedTask(l);
    expect(l.balanceOf(l.vaultAddress)).toBe("5.00");
    expect(l.explorerNftUrl(mint.nftId)).toBe(`https://testnet.xrpl.org/nft/${mint.nftId}`);

    const claim = await l.agent.acceptOffer(offer.offerId, { taskId: "task_1" });
    expect(claim.kind).toBe("task_claim");
    expect(l.getNft(mint.nftId)?.owner).toBe(l.agentAddress);
    expect(l.balanceOf(l.agentAddress)).toBe("9.00");

    const fund = await l.agent.fundSubtask("sub_1", "4.00", { taskId: "task_1" });
    await expect(
      l.verifyTx(fund.hash, {
        kind: "subtask_funding",
        from: l.agentAddress,
        to: l.vaultAddress,
        amount: "4.00",
        memo: "sub_1",
      }),
    ).resolves.toMatchObject({ validated: true });
    await expect(l.verifyTx(fund.hash, { kind: "task_claim" })).rejects.toBeInstanceOf(
      LedgerTxFailedError,
    );

    const sm = await l.mintSubtaskNft("sub_1", "http://api.test/tasks/sub_1.json");
    const so = await l.offerSubtaskToAnyone(sm.nftId, "sub_1");
    const helper = await l.createWallet("helper");
    await l.acceptOffer(helper.seed, so.offerId, { taskId: "task_1", subtaskId: "sub_1" });

    const hr = await l.createRedeemOffer(helper.seed, sm.nftId, "4.00", {
      taskId: "task_1",
      subtaskId: "sub_1",
    });
    expect(hr.kind).toBe("helper_redeem_offer");
    const hp = await l.acceptRedeemOffer(hr.offerId, { taskId: "task_1", subtaskId: "sub_1" });
    expect(hp.kind).toBe("helper_payout");
    await l.burn(sm.nftId, { subtaskId: "sub_1" });

    const ar = await l.agent.createRedeemOffer(mint.nftId, "6.00", { taskId: "task_1" });
    await l.acceptRedeemOffer(ar.offerId, { taskId: "task_1" });
    await l.burn(mint.nftId, { taskId: "task_1" });

    expect(l.balanceOf(helper.address)).toBe("4.00");
    expect(l.balanceOf(l.agentAddress)).toBe("11.00"); // +1.00
    expect(l.balanceOf(l.vaultAddress)).toBe("0.00");
    expect(l.getNft(mint.nftId)?.burned).toBe(true);
  });

  it("lets only one of two simultaneous claims win", async () => {
    const l = new FakeLedger({ latencyMs: 20 });
    const m = await l.mintSubtaskNft("sub_1", "u");
    const o = await l.offerSubtaskToAnyone(m.nftId, "sub_1");
    const [a, b] = await Promise.all([l.createWallet("helper"), l.createWallet("helper")]);
    const results = await Promise.allSettled([
      l.acceptOffer(a.seed, o.offerId, { subtaskId: "sub_1" }),
      l.acceptOffer(b.seed, o.offerId, { subtaskId: "sub_1" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0]!.reason).toBeInstanceOf(AlreadyClaimedError);
  });

  it("reserves the task offer for the agent", async () => {
    const l = new FakeLedger({ latencyMs: 0 });
    const { offer } = await fundedTask(l);
    const other = await l.createWallet("helper");
    await expect(
      l.acceptOffer(other.seed, offer.offerId, { taskId: "task_1" }),
    ).rejects.toBeInstanceOf(LedgerTxFailedError);
  });

  it("fails a task idempotently with PRD 2.3 refunds", async () => {
    const l = new FakeLedger({ latencyMs: 0, agentBalance: "10.00" });
    const { req, mint, offer } = await fundedTask(l);
    await l.agent.acceptOffer(offer.offerId, { taskId: "task_1" });
    await l.agent.fundSubtask("sub_1", "4.00");
    const sm = await l.mintSubtaskNft("sub_1", "u");
    const input = {
      taskId: "task_1",
      taskNftId: mint.nftId,
      subtaskNftIds: [sm.nftId],
      requesterAddress: req.address,
      refundToRequester: "6.00",
      agentAddress: l.agentAddress,
      refundToAgent: "4.00",
    };
    const [first, second] = await Promise.all([l.failTask(input), l.failTask(input)]);
    expect(first.map((r) => r.kind).sort()).toEqual([
      "refund_agent",
      "refund_requester",
      "subtask_nft_burn",
      "task_nft_burn",
    ]);
    expect(second).toBe(first);
    await l.failTask(input);
    expect(l.balanceOf(req.address)).toBe("6.00"); // 5 back + 1 pledge
    expect(l.balanceOf(l.agentAddress)).toBe("9.00"); // lost the pledge, got the 4 back
    expect(l.balanceOf(l.vaultAddress)).toBe("0.00");
  });
});
