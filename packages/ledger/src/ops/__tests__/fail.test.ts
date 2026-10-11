import { describe, expect, it } from "vitest";
import { Wallet, type Client, type Memo } from "xrpl";
import { loadConfig } from "../../config.js";
import { LedgerError } from "../../errors.js";
import { failTask, planFailTask, vaultStateFromHistory, type FailTaskInput } from "../fail.js";
import { buildMemos } from "../memo.js";

const config = loadConfig({} as NodeJS.ProcessEnv);
const vault = Wallet.generate();
const requester = Wallet.generate().classicAddress;
const agent = Wallet.generate().classicAddress;
const helper = Wallet.generate().classicAddress;
const TASK_NFT = "TASKNFT".padEnd(64, "0");
const SUB_NFT = "SUBNFT".padEnd(64, "0");

const input: FailTaskInput = {
  vault,
  taskId: "t1",
  taskNftId: TASK_NFT,
  requesterAddress: requester,
  price: "5",
  pledge: "1",
  agentAddress: agent,
  subtasks: [{ subtaskId: "t1-s1", nftId: SUB_NFT, amount: "4", helperAddress: helper }],
};

type Tx = Record<string, unknown> & { TransactionType: string; Account: string };

/**
 * An in-memory ledger behind the two client methods the ops use: request (account_tx,
 * account_nfts) and submitAndWait. No network.
 */
class FakeLedger {
  holders = new Map<string, string>([
    [TASK_NFT, agent],
    [SUB_NFT, helper],
  ]);
  history: { hash: string; tx_json: Tx; meta: { TransactionResult: string }; validated: true }[] =
    [];
  submitted: Tx[] = [];
  /** Engine results to return for the next submits, in order. Default tesSUCCESS. */
  nextResults: string[] = [];
  private counter = 0;

  readonly client = {
    request: async (req: { command: string; account: string }) => {
      if (req.command === "account_tx") {
        return { result: { transactions: [...this.history].reverse() } };
      }
      if (req.command === "account_nfts") {
        const nfts = [...this.holders]
          .filter(([, owner]) => owner === req.account)
          .map(([NFTokenID]) => ({ NFTokenID }));
        return { result: { account_nfts: nfts } };
      }
      throw new Error(`unexpected ${req.command}`);
    },
    submitAndWait: async (tx: Tx) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      this.submitted.push(tx);
      const result = this.nextResults.shift() ?? "tesSUCCESS";
      const hash = `H${++this.counter}`.padEnd(64, "0");
      if (result === "tesSUCCESS" && tx.TransactionType === "NFTokenBurn") {
        this.holders.delete(String(tx.NFTokenID));
      }
      this.history.push({
        hash,
        tx_json: tx,
        meta: { TransactionResult: result },
        validated: true,
      });
      return {
        result: { hash, tx_json: tx, meta: { TransactionResult: result }, validated: true },
      };
    },
  };

  get ctx() {
    return { client: this.client as unknown as Client, config };
  }

  /** Records a transaction that happened before the test, for example in an earlier process. */
  seed(tx: Tx, meta: Record<string, unknown> = {}) {
    const hash = `SEED${++this.counter}`.padEnd(64, "0");
    this.history.push({
      hash,
      tx_json: tx,
      meta: { TransactionResult: "tesSUCCESS", ...meta },
      validated: true,
    });
  }
}

function payments(ledger: FakeLedger) {
  return ledger.submitted
    .filter((tx) => tx.TransactionType === "Payment")
    .map((tx) => ({ to: tx.Destination, value: (tx.Amount as { value: string }).value }));
}

describe("failTask", () => {
  it("burns both NFTs from their holders, then refunds the requester and the agent", async () => {
    const ledger = new FakeLedger();
    const result = await failTask(input, ledger.ctx);

    expect(ledger.submitted.map((tx) => tx.TransactionType)).toEqual([
      "NFTokenBurn",
      "NFTokenBurn",
      "Payment",
      "Payment",
    ]);
    expect(ledger.submitted[0]).toMatchObject({ NFTokenID: TASK_NFT, Owner: agent });
    expect(ledger.submitted[1]).toMatchObject({ NFTokenID: SUB_NFT, Owner: helper });
    expect(payments(ledger)).toEqual([
      { to: requester, value: "6" },
      { to: agent, value: "4" },
    ]);
    expect(result.burns.map((b) => b.kind)).toEqual(["nft.burn", "nft.burn"]);
    expect(result.refunds.map((r) => r.label)).toEqual([
      `refund 6 (price + pledge) to requester ${requester}`,
      `refund 4 (sub-task t1-s1) to agent ${agent}`,
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("does nothing on a second call", async () => {
    const ledger = new FakeLedger();
    await failTask(input, ledger.ctx);
    const before = ledger.submitted.length;

    const second = await failTask(input, ledger.ctx);
    expect(ledger.submitted.length).toBe(before);
    expect(second.burns).toEqual([]);
    expect(second.refunds).toEqual([]);
    expect(second.skipped).toHaveLength(4);
  });

  it("pays once when two calls run at the same time", async () => {
    const ledger = new FakeLedger();
    await Promise.all([failTask(input, ledger.ctx), failTask(input, ledger.ctx)]);
    expect(payments(ledger)).toHaveLength(2);
  });

  it("finishes a partly done failure without repeating the done steps", async () => {
    const ledger = new FakeLedger();
    ledger.seed({
      TransactionType: "NFTokenBurn",
      Account: vault.classicAddress,
      NFTokenID: TASK_NFT,
    });
    ledger.holders.delete(TASK_NFT);
    ledger.seed({
      TransactionType: "Payment",
      Account: vault.classicAddress,
      Destination: requester,
      Memos: buildMemos({ task: "t1", action: "refund" }),
    });

    const result = await failTask(input, ledger.ctx);
    expect(ledger.submitted.map((tx) => tx.TransactionType)).toEqual(["NFTokenBurn", "Payment"]);
    expect(payments(ledger)).toEqual([{ to: agent, value: "4" }]);
    expect(result.skipped).toHaveLength(2);
  });

  it("treats a burn that another call made first (tecNO_ENTRY) as done", async () => {
    const ledger = new FakeLedger();
    ledger.nextResults = ["tecNO_ENTRY"];
    const result = await failTask(input, ledger.ctx);
    expect(result.burns).toHaveLength(1);
    expect(result.skipped).toEqual([`burn task NFT ${TASK_NFT}: already burned`]);
    expect(payments(ledger)).toHaveLength(2);
  });

  it("refuses to refund a task whose NFT the vault already bought back in a payout", async () => {
    const ledger = new FakeLedger();
    ledger.seed(
      {
        TransactionType: "NFTokenAcceptOffer",
        Account: vault.classicAddress,
        NFTokenSellOffer: "O",
      },
      { nftoken_id: SUB_NFT },
    );
    await expect(failTask(input, ledger.ctx)).rejects.toMatchObject({ code: "ALREADY_PAID_OUT" });
    expect(ledger.submitted).toEqual([]);
  });

  it("throws, and pays nothing, when no candidate holds an NFT that is not burned", async () => {
    const ledger = new FakeLedger();
    ledger.holders.set(SUB_NFT, Wallet.generate().classicAddress);
    await expect(failTask(input, ledger.ctx)).rejects.toMatchObject({ code: "NFT_HOLDER_UNKNOWN" });
    expect(payments(ledger)).toEqual([]);
  });

  it("does not count a refund for another task or a failed refund", async () => {
    const ledger = new FakeLedger();
    ledger.seed({
      TransactionType: "Payment",
      Account: vault.classicAddress,
      Destination: requester,
      Memos: buildMemos({ task: "other-task", action: "refund" }),
    });
    ledger.history.push({
      hash: "F".padEnd(64, "0"),
      tx_json: {
        TransactionType: "Payment",
        Account: vault.classicAddress,
        Destination: requester,
        Memos: buildMemos({ task: "t1", action: "refund" }) as Memo[],
      },
      meta: { TransactionResult: "tecPATH_DRY" },
      validated: true,
    });
    await failTask(input, ledger.ctx);
    expect(payments(ledger)).toEqual([
      { to: requester, value: "6" },
      { to: agent, value: "4" },
    ]);
  });
});

describe("planFailTask", () => {
  const empty = vaultStateFromHistory(vault.classicAddress, []);

  it("burns only minted NFTs and skips a zero pledge refund", () => {
    const plan = planFailTask(
      { ...input, taskNftId: undefined, pledge: "0", price: "0", subtasks: [] },
      empty,
    );
    expect(plan.steps).toEqual([]);
    expect(plan.skipped).toEqual([
      `refund 0 (price + pledge) to requester ${requester}: amount is zero`,
    ]);
  });

  it("refunds only the price when the agent never claimed", () => {
    const plan = planFailTask({ ...input, pledge: "0", subtasks: [] }, empty);
    expect(plan.steps.map((s) => s.type)).toEqual(["burn", "refund"]);
    expect(plan.steps[1]).toMatchObject({ destination: requester, amount: "5" });
  });

  it("needs the agent address to refund sub-task money", () => {
    expect(() => planFailTask({ ...input, agentAddress: undefined }, empty)).toThrow(TypeError);
  });

  it("is a LedgerError for an already paid-out task", () => {
    const state = { ...empty, paidOutNftIds: new Set([TASK_NFT]) };
    expect(() => planFailTask(input, state)).toThrow(LedgerError);
  });
});
