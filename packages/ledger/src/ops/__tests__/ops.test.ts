import type { TxPendingEvent } from "../../shared-types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NFTokenCreateOfferFlags, NFTokenMintFlags, Wallet } from "xrpl";
import { ledgerEvents } from "../../events.js";
import { readMemos } from "../../memo.js";
import { acceptOffer } from "../claim.js";
import { failTask } from "../fail.js";
import { createSellOffer } from "../nft.js";
import { acceptPayoutOffer, burnNft, createPayoutOffer, redeem } from "../payout.js";
import {
  fundSubtask,
  mintSubtaskNft,
  mintSubtaskNftWithOffer,
  offerSubtaskToAnyone,
} from "../subtask.js";
import { fundTask, mintTaskNft, mintTaskNftWithOffer, offerTaskToAgent } from "../task.js";
import { transferToken } from "../transfer.js";
import { FakeLedger, type Tx } from "./fake-ledger.js";

const vault = Wallet.generate();
const requester = Wallet.generate();
const agent = Wallet.generate();
const helper = Wallet.generate();
const URI = "https://board.example/api/nft/tasks/t1";
const NFT_FLAGS = NFTokenMintFlags.tfBurnable | NFTokenMintFlags.tfTransferable;

let ledger: FakeLedger;
let pending: TxPendingEvent[];
let off: () => void;
beforeEach(() => {
  ledger = new FakeLedger();
  ledger.createAccount(vault.classicAddress);
  pending = [];
  off = ledgerEvents.on("tx.pending", (e) => pending.push(e));
});
afterEach(() => off());

const last = (): Tx => ledger.submitted.at(-1)!;
const token = (value: string) => ({
  currency: ledger.config.XRPL_TOKEN_CURRENCY,
  issuer: ledger.config.XRPL_TOKEN_ISSUER,
  value,
});
const memosOf = (tx: Tx) => readMemos(tx.Memos);

async function mintedTask() {
  return mintTaskNft({ vault, uri: URI, taskId: "t1" }, ledger.ctx);
}

describe("task ops", () => {
  it("fundTask pays the price in the token to the vault with the task memos", async () => {
    await fundTask({ requester, vault, amount: "5.00", taskId: "t1" }, ledger.ctx);
    expect(last()).toMatchObject({
      TransactionType: "Payment",
      Account: requester.classicAddress,
      Destination: vault.classicAddress,
      Amount: token("5"),
    });
    expect(memosOf(last())).toEqual({ task: "t1", action: "task.fund" });
    expect(pending.at(-1)).toMatchObject({ kind: "task.fund", taskId: "t1" });
  });

  it("mintTaskNft sets exactly tfBurnable and tfTransferable, no tfTrustLine, no offer", async () => {
    const mint = await mintedTask();
    const tx = last();
    expect(tx.Flags).toBe(NFT_FLAGS);
    expect(Number(tx.Flags) & NFTokenMintFlags.tfTrustLine).toBe(0);
    expect(tx).toMatchObject({ TransactionType: "NFTokenMint", NFTokenTaxon: 1, TransferFee: 0 });
    expect(tx).not.toHaveProperty("Amount");
    expect(Buffer.from(String(tx.URI), "hex").toString()).toBe(URI);
    expect(ledger.holders.get(mint.nftId)).toBe(vault.classicAddress);
  });

  it("offerTaskToAgent sells for the pledge, only to the agent", async () => {
    const mint = await mintedTask();
    await offerTaskToAgent(
      {
        vault,
        nftId: mint.nftId,
        pledgeAmount: "1",
        agentAddress: agent.classicAddress,
        taskId: "t1",
      },
      ledger.ctx,
    );
    expect(last()).toMatchObject({
      TransactionType: "NFTokenCreateOffer",
      Flags: NFTokenCreateOfferFlags.tfSellNFToken,
      NFTokenID: mint.nftId,
      Destination: agent.classicAddress,
      Amount: token("1"),
    });
    expect(memosOf(last())).toEqual({ task: "t1", action: "task.offer" });
  });

  it("mintTaskNftWithOffer makes the NFT and the agent-only pledge offer in one transaction", async () => {
    const result = await mintTaskNftWithOffer(
      { vault, uri: URI, taskId: "t1", pledgeAmount: "1", agentAddress: agent.classicAddress },
      ledger.ctx,
    );
    expect(ledger.submitted).toHaveLength(1);
    expect(last()).toMatchObject({
      TransactionType: "NFTokenMint",
      Flags: NFT_FLAGS,
      Amount: token("1"),
      Destination: agent.classicAddress,
    });
    const claim = await acceptOffer(
      { claimer: agent, offerId: result.offerId, taskId: "t1" },
      ledger.ctx,
    );
    expect(claim).toMatchObject({ nftId: result.nftId, holder: agent.classicAddress });
  });

  it("acceptOffer moves the NFT and tags the claim", async () => {
    const mint = await mintedTask();
    const offer = await offerTaskToAgent(
      {
        vault,
        nftId: mint.nftId,
        pledgeAmount: "1",
        agentAddress: agent.classicAddress,
        taskId: "t1",
      },
      ledger.ctx,
    );
    const claim = await acceptOffer(
      { claimer: agent, offerId: offer.offerId, taskId: "t1" },
      ledger.ctx,
    );
    expect(last()).toMatchObject({
      TransactionType: "NFTokenAcceptOffer",
      NFTokenSellOffer: offer.offerId,
    });
    expect(claim).toMatchObject({
      kind: "task.claim",
      nftId: mint.nftId,
      holder: agent.classicAddress,
    });
    expect(ledger.holders.get(mint.nftId)).toBe(agent.classicAddress);
  });

  it("acceptOffer throws AlreadyClaimedError for an offer someone else took", async () => {
    const mint = await mintSubtaskNftWithOffer(
      { vault, uri: URI, subtaskId: "s1", taskId: "t1", parentNftId: "A1".repeat(32) },
      ledger.ctx,
    );
    await acceptOffer(
      { claimer: helper, offerId: mint.offerId, kind: "subtask.claim", taskId: "t1" },
      ledger.ctx,
    );
    await expect(
      acceptOffer(
        { claimer: agent, offerId: mint.offerId, kind: "subtask.claim", taskId: "t1" },
        ledger.ctx,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });
  });
});

describe("sub-task ops", () => {
  const parentNftId = "A1".repeat(32);

  it("fundSubtask pays the vault with task, sub-task, and action memos", async () => {
    await fundSubtask({ agent, vault, amount: "4", subtaskId: "s1", taskId: "t1" }, ledger.ctx);
    expect(last()).toMatchObject({ Destination: vault.classicAddress, Amount: token("4") });
    expect(memosOf(last())).toEqual({ task: "t1", subtask: "s1", action: "subtask.fund" });
    expect(pending.at(-1)).toMatchObject({ kind: "subtask.fund", taskId: "t1" });
  });

  it("mintSubtaskNft writes the parent task and parent NFT, and its events carry the task ID", async () => {
    await mintSubtaskNft(
      { vault, uri: URI, subtaskId: "s1", taskId: "t1", parentNftId },
      ledger.ctx,
    );
    expect(last()).toMatchObject({ Flags: NFT_FLAGS, NFTokenTaxon: 2 });
    expect(memosOf(last())).toEqual({
      task: "t1",
      subtask: "s1",
      parentNft: parentNftId,
      action: "subtask.mint",
    });
    // One task memo only, from buildMemos. submitTx did not add a second one.
    expect((last().Memos as unknown[]).length).toBe(4);
    expect(pending.at(-1)).toMatchObject({ kind: "subtask.mint", taskId: "t1" });
  });

  it("mintSubtaskNft rejects a parentNftId that is not an NFT ID", async () => {
    await expect(
      mintSubtaskNft(
        { vault, uri: URI, subtaskId: "s1", taskId: "t1", parentNftId: "nope" },
        ledger.ctx,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(ledger.submitted).toEqual([]);
  });

  it("offerSubtaskToAnyone sells for 0 XRP drops with no Destination", async () => {
    const mint = await mintSubtaskNft(
      { vault, uri: URI, subtaskId: "s1", taskId: "t1", parentNftId },
      ledger.ctx,
    );
    await offerSubtaskToAnyone(
      { vault, nftId: mint.nftId, subtaskId: "s1", taskId: "t1" },
      ledger.ctx,
    );
    expect(last()).toMatchObject({ Amount: "0", Flags: NFTokenCreateOfferFlags.tfSellNFToken });
    expect(last()).not.toHaveProperty("Destination");
    expect(pending.at(-1)).toMatchObject({ kind: "subtask.offer", taskId: "t1" });
  });

  it("rejects a zero token amount for the open offer before it signs", async () => {
    const mint = await mintSubtaskNft(
      { vault, uri: URI, subtaskId: "s1", taskId: "t1", parentNftId },
      ledger.ctx,
    );
    const count = ledger.submitted.length;
    await expect(
      offerSubtaskToAnyone(
        { vault, nftId: mint.nftId, subtaskId: "s1", taskId: "t1", amount: token("0") },
        ledger.ctx,
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      mintSubtaskNftWithOffer(
        { vault, uri: URI, subtaskId: "s2", taskId: "t1", parentNftId, amount: token("0") },
        ledger.ctx,
      ),
    ).rejects.toThrow(TypeError);
    expect(ledger.submitted.length).toBe(count);
  });

  it("mintSubtaskNftWithOffer makes the NFT and the open 0-drop offer in one transaction", async () => {
    const result = await mintSubtaskNftWithOffer(
      { vault, uri: URI, subtaskId: "s1", taskId: "t1", parentNftId },
      ledger.ctx,
    );
    expect(ledger.submitted).toHaveLength(1);
    expect(last()).toMatchObject({ TransactionType: "NFTokenMint", Amount: "0", Flags: NFT_FLAGS });
    expect(last()).not.toHaveProperty("Destination");
    expect(result.offerId).toMatch(/^[0-9A-F]{64}$/);
  });
});

describe("payout ops", () => {
  async function heldByHelper() {
    const mint = await mintSubtaskNftWithOffer(
      { vault, uri: URI, subtaskId: "s1", taskId: "t1", parentNftId: "A1".repeat(32) },
      ledger.ctx,
    );
    await acceptOffer(
      {
        claimer: helper,
        offerId: mint.offerId,
        kind: "subtask.claim",
        taskId: "t1",
        subtaskId: "s1",
      },
      ledger.ctx,
    );
    return mint.nftId;
  }

  const accept = (offerId: string, nftId: string, overrides: Record<string, unknown> = {}) =>
    acceptPayoutOffer(
      { vault, offerId, nftId, holderAddress: helper.classicAddress, amount: "4", ...overrides },
      ledger.ctx,
    );

  it("createPayoutOffer sells the NFT to the vault for the payout", async () => {
    const nftId = await heldByHelper();
    await createPayoutOffer(
      {
        holder: helper,
        vaultAddress: vault.classicAddress,
        nftId,
        amount: "4",
        taskId: "t1",
        subtaskId: "s1",
      },
      ledger.ctx,
    );
    expect(last()).toMatchObject({
      Account: helper.classicAddress,
      Flags: NFTokenCreateOfferFlags.tfSellNFToken,
      Destination: vault.classicAddress,
      Amount: token("4"),
    });
    expect(memosOf(last())).toEqual({ task: "t1", subtask: "s1", action: "payout.offer" });
  });

  it("acceptPayoutOffer accepts an offer that matches", async () => {
    const nftId = await heldByHelper();
    const offer = await createPayoutOffer(
      { holder: helper, vaultAddress: vault.classicAddress, nftId, amount: "4" },
      ledger.ctx,
    );
    const tx = await accept(offer.offerId, nftId);
    expect(tx.kind).toBe("payout.accept");
    expect(ledger.holders.get(nftId)).toBe(vault.classicAddress);
  });

  it.each([
    ["another owner", { holderAddress: agent.classicAddress }, "owner is"],
    ["another amount", { amount: "3" }, "Amount is 4, expected 3"],
    ["another NFT", { nftId: "C3".repeat(32) }, "is not a sell offer for NFT"],
  ])("acceptPayoutOffer refuses %s and submits nothing", async (_, overrides, message) => {
    const nftId = await heldByHelper();
    const offer = await createPayoutOffer(
      { holder: helper, vaultAddress: vault.classicAddress, nftId, amount: "4" },
      ledger.ctx,
    );
    const count = ledger.submitted.length;
    const error = await accept(offer.offerId, nftId, overrides).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "OFFER_MISMATCH" });
    expect((error as Error).message).toContain(message);
    expect(ledger.submitted.length).toBe(count);
  });

  it("acceptPayoutOffer refuses an offer without the vault as Destination, or in XRP", async () => {
    const nftId = await heldByHelper();
    const open = await createSellOffer(
      { seller: helper, nftId, amount: token("4"), memos: [], kind: "payout.offer" },
      ledger.ctx,
    );
    const xrp = await createSellOffer(
      {
        seller: helper,
        nftId,
        amount: "4000000",
        destination: vault.classicAddress,
        memos: [],
        kind: "payout.offer",
      },
      ledger.ctx,
    );
    const count = ledger.submitted.length;
    await expect(accept(open.offerId, nftId)).rejects.toThrow(/Destination is \(none\)/);
    await expect(accept(xrp.offerId, nftId)).rejects.toThrow(/XRP drops/);
    expect(ledger.submitted.length).toBe(count);
  });

  it("redeem makes the offer and accepts it, both checked", async () => {
    const nftId = await heldByHelper();
    const result = await redeem(
      { holder: helper, vault, nftId, amount: "4", taskId: "t1" },
      ledger.ctx,
    );
    expect(result.offer.kind).toBe("payout.offer");
    expect(result.accept.kind).toBe("payout.accept");
    expect(ledger.holders.get(nftId)).toBe(vault.classicAddress);
  });

  const proof = "0f".repeat(32);

  it("createPayoutOffer and acceptPayoutOffer write the proof memo", async () => {
    const nftId = await heldByHelper();
    const ids = { taskId: "t1", subtaskId: "s1", proofSha256: proof };
    const offer = await createPayoutOffer(
      { holder: helper, vaultAddress: vault.classicAddress, nftId, amount: "4", ...ids },
      ledger.ctx,
    );
    expect(memosOf(last())).toEqual({
      task: "t1",
      subtask: "s1",
      action: "payout.offer",
      proof,
    });
    await accept(offer.offerId, nftId, ids);
    expect(last()).toMatchObject({ TransactionType: "NFTokenAcceptOffer" });
    expect(memosOf(last())).toEqual({
      task: "t1",
      subtask: "s1",
      action: "payout.accept",
      proof,
    });
  });

  it("redeem writes the proof memo on both transactions", async () => {
    const nftId = await heldByHelper();
    const before = ledger.submitted.length;
    await redeem(
      {
        holder: helper,
        vault,
        nftId,
        amount: "4",
        taskId: "t1",
        subtaskId: "s1",
        proofSha256: proof.toUpperCase(),
      },
      ledger.ctx,
    );
    const txs = ledger.submitted.slice(before);
    expect(txs.map((tx) => memosOf(tx).proof)).toEqual([proof, proof]);
  });

  it("leaves the proof memo out without a proofSha256", async () => {
    const nftId = await heldByHelper();
    const before = ledger.submitted.length;
    await redeem({ holder: helper, vault, nftId, amount: "4", taskId: "t1" }, ledger.ctx);
    for (const tx of ledger.submitted.slice(before)) {
      expect(memosOf(tx)).not.toHaveProperty("proof");
    }
  });

  it.each(["", "abc", "z".repeat(64), "a".repeat(65)])(
    "refuses the proof %j with INVALID_INPUT before it signs",
    async (bad) => {
      const nftId = await heldByHelper();
      const offer = await createPayoutOffer(
        { holder: helper, vaultAddress: vault.classicAddress, nftId, amount: "4" },
        ledger.ctx,
      );
      const count = ledger.submitted.length;
      const invalid = expect.objectContaining({ code: "INVALID_INPUT" });
      await expect(
        createPayoutOffer(
          {
            holder: helper,
            vaultAddress: vault.classicAddress,
            nftId,
            amount: "4",
            proofSha256: bad,
          },
          ledger.ctx,
        ),
      ).rejects.toEqual(invalid);
      await expect(accept(offer.offerId, nftId, { proofSha256: bad })).rejects.toEqual(invalid);
      await expect(
        redeem({ holder: helper, vault, nftId, amount: "4", proofSha256: bad }, ledger.ctx),
      ).rejects.toEqual(invalid);
      expect(ledger.submitted.length).toBe(count);
    },
  );

  it("burnNft names the Owner only when someone other than the vault holds the NFT", async () => {
    const nftId = await heldByHelper();
    await burnNft({ vault, nftId, owner: helper.classicAddress, taskId: "t1" }, ledger.ctx);
    expect(last()).toMatchObject({
      TransactionType: "NFTokenBurn",
      NFTokenID: nftId,
      Owner: helper.classicAddress,
    });
    const mine = await mintedTask();
    await burnNft({ vault, nftId: mine.nftId, owner: vault.classicAddress }, ledger.ctx);
    expect(last()).not.toHaveProperty("Owner");
  });
});

describe("transferToken", () => {
  it("pays the configured token with the transfer memo, and failTask ignores it", async () => {
    const treasury = Wallet.generate();
    const tx = await transferToken(
      { from: treasury, to: requester.classicAddress, amount: "5", taskId: "t1" },
      ledger.ctx,
    );
    expect(tx.kind).toBe("token.transfer");
    expect(last()).toMatchObject({
      TransactionType: "Payment",
      Account: treasury.classicAddress,
      Destination: requester.classicAddress,
      Amount: token("5"),
    });
    expect(memosOf(last())).toEqual({ task: "t1", action: "token.transfer" });
    expect(pending.at(-1)).toMatchObject({ kind: "token.transfer", taskId: "t1" });
  });

  it("works without a task memo", async () => {
    await transferToken({ from: vault, to: requester.classicAddress, amount: "2" }, ledger.ctx);
    expect(memosOf(last())).toEqual({ action: "token.transfer" });
  });
});

describe("one-step mints in the failure flow", () => {
  it("counts the pledge paid through a mint-made offer", async () => {
    await fundTask({ requester, vault, amount: "5", taskId: "t1" }, ledger.ctx);
    const task = await mintTaskNftWithOffer(
      { vault, uri: URI, taskId: "t1", pledgeAmount: "1", agentAddress: agent.classicAddress },
      ledger.ctx,
    );
    await acceptOffer({ claimer: agent, offerId: task.offerId, taskId: "t1" }, ledger.ctx);
    const start = ledger.submitted.length;
    await failTask(
      {
        vault,
        taskId: "t1",
        taskNftId: task.nftId,
        requesterAddress: requester.classicAddress,
        price: "5",
        pledge: "1",
        agentAddress: agent.classicAddress,
      },
      ledger.ctx,
    );
    const refund = ledger.submitted.slice(start).find((tx) => tx.TransactionType === "Payment");
    expect(refund).toMatchObject({ Destination: requester.classicAddress, Amount: token("6") });
  });
});
