import type { LedgerEventMap, LedgerEventName } from "@agent-pledge/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decode,
  DisconnectedError,
  hashes,
  RippledError,
  Wallet,
  type Client,
  type Payment,
  type SubmittableTransaction,
} from "xrpl";
import { loadConfig } from "../config.js";
import {
  AlreadyClaimedError,
  InvalidTransactionError,
  NetworkError,
  NotAllowedError,
  TxExpiredError,
} from "../errors.js";
import { ledgerEvents } from "../events.js";
import { readTaskMemo, taskMemo } from "../memo.js";
import { submitTx } from "../submit.js";

const config = loadConfig({});
const DESTINATION = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const LAST_LEDGER = 120;

interface Script {
  /** engine_result of submit. Default tesSUCCESS. */
  preliminary?: string;
  /** engine_result of successive submits. Falls back to `preliminary` when used up. */
  preliminaries?: string[];
  /** Errors thrown by successive submits before the script continues. */
  submitErrors?: Error[];
  /** TransactionResult in the validated meta. Default tesSUCCESS. */
  final?: string;
  /** Number of `tx` lookups that return txnNotFound before it is validated. Infinity: never. */
  notFoundPolls?: number;
  /** Errors thrown by successive `tx` lookups before the script continues. */
  txErrors?: Error[];
}

/**
 * A fake rippled. Like the real one, autofill reads the account Sequence of the open ledger and
 * does not change it. The Sequence goes up only when the open ledger applies a transaction (a `tes`
 * or `tec` preliminary result) or when a held transaction (for example `terQUEUED`) validates.
 */
function mockClient(script: Script = {}) {
  const calls: string[] = [];
  let sequence = 10;
  let ledger = 100;
  let polls = 0;
  let connected = true;
  const txErrors = [...(script.txErrors ?? [])];
  const submitErrors = [...(script.submitErrors ?? [])];
  const preliminaries = [...(script.preliminaries ?? [])];
  const signed: { Sequence: number; hash: string }[] = [];
  const client = {
    url: "wss://mock",
    isConnected: () => connected,
    connect: vi.fn(async () => {
      connected = true;
    }),
    autofill: vi.fn(async (tx: SubmittableTransaction) => {
      calls.push("autofill");
      await new Promise((r) => setTimeout(r, 5));
      return { ...tx, Fee: "12", Sequence: sequence, LastLedgerSequence: LAST_LEDGER };
    }),
    getLedgerIndex: vi.fn(async () => (ledger += 4)),
    request: vi.fn(async (request: { command: string; tx_blob?: string; transaction?: string }) => {
      calls.push(request.command);
      if (request.command === "submit") {
        await new Promise((r) => setTimeout(r, 5));
        const tx = decode(request.tx_blob!) as { Sequence: number };
        signed.push({ Sequence: tx.Sequence, hash: hashes.hashSignedTx(request.tx_blob!) });
        // The server got the blob, but the answer is lost with the socket.
        const error = submitErrors.shift();
        if (error) {
          connected = false;
          throw error;
        }
        const engineResult = preliminaries.shift() ?? script.preliminary ?? "tesSUCCESS";
        if (/^te[sc]/.test(engineResult)) sequence = Math.max(sequence, tx.Sequence + 1);
        return { result: { engine_result: engineResult } };
      }
      if (request.command === "tx") {
        const error = txErrors.shift();
        if (error) {
          connected = false;
          throw error;
        }
        if (polls++ < (script.notFoundPolls ?? 0)) {
          throw new RippledError("txnNotFound", { error: "txnNotFound" });
        }
        const held = signed.find((s) => s.hash === request.transaction);
        if (held) sequence = Math.max(sequence, held.Sequence + 1);
        return {
          result: {
            hash: request.transaction,
            validated: true,
            ledger_index: 104,
            meta: { TransactionResult: script.final ?? "tesSUCCESS" },
          },
        };
      }
      throw new Error(`unexpected ${request.command}`);
    }),
  };
  return { client: client as unknown as Client, mock: client, calls, signed };
}

function recordEvents() {
  const seen: Array<
    { [E in LedgerEventName]: { name: E; payload: LedgerEventMap[E] } }[LedgerEventName]
  > = [];
  const names: LedgerEventName[] = ["tx.pending", "tx.validated", "tx.failed", "tx.unknown"];
  const offs = names.map((name) =>
    ledgerEvents.on(name, (payload) => seen.push({ name, payload } as (typeof seen)[number])),
  );
  return { seen, stop: () => offs.forEach((off) => off()) };
}

const wallet = Wallet.generate();
const payment = (): Payment => ({
  TransactionType: "Payment",
  Account: wallet.classicAddress,
  Destination: DESTINATION,
  Amount: "1000",
});
const fast = { config, pollIntervalMs: 1 };

let events: ReturnType<typeof recordEvents>;
beforeEach(() => {
  events = recordEvents();
});
afterEach(() => events.stop());

describe("submitTx", () => {
  it("emits pending with the hash, then validated, and returns the response", async () => {
    const { client } = mockClient({ notFoundPolls: 2 });
    const response = await submitTx(client, wallet, payment(), {
      ...fast,
      kind: "task.fund",
      taskId: "task-7",
    });
    expect(events.seen.map((e) => e.name)).toEqual(["tx.pending", "tx.validated"]);
    const [pending, validated] = events.seen;
    expect(pending!.payload).toEqual({
      hash: response.result.hash,
      kind: "task.fund",
      txType: "Payment",
      account: wallet.classicAddress,
      taskId: "task-7",
      explorerUrl: `https://testnet.xrpl.org/transactions/${response.result.hash}`,
    });
    expect(validated!.payload).toMatchObject({
      hash: response.result.hash,
      result: "tesSUCCESS",
      ledgerIndex: 104,
    });
  });

  it("adds the task memo to the signed transaction", async () => {
    const { client, mock } = mockClient();
    await submitTx(client, wallet, payment(), { ...fast, taskId: "task-8" });
    const submit = mock.request.mock.calls.find(([r]) => r.command === "submit")![0];
    expect(readTaskMemo(decode(submit.tx_blob!))).toBe("task-8");
  });

  it("does not add a second task memo when the transaction already has it", async () => {
    const { client, mock } = mockClient();
    const tagged = { ...payment(), Memos: taskMemo("task-9") };
    await submitTx(client, wallet, tagged, { ...fast, taskId: "task-9" });
    const submit = mock.request.mock.calls.find(([r]) => r.command === "submit")![0];
    expect((decode(submit.tx_blob!) as { Memos: unknown[] }).Memos).toHaveLength(1);
    expect(events.seen[0]!.payload).toMatchObject({ taskId: "task-9" });
  });

  it("rejects a taskId that differs from the task memo on the transaction", async () => {
    const { client, calls } = mockClient();
    const tagged = { ...payment(), Memos: taskMemo("task-9") };
    await expect(
      submitTx(client, wallet, tagged, { ...fast, taskId: "task-10" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toEqual([]);
  });

  it("uses null kind and taskId when the caller gives none", async () => {
    const { client } = mockClient();
    await submitTx(client, wallet, payment(), fast);
    expect(events.seen[0]!.payload).toMatchObject({ kind: null, taskId: null });
  });

  it("throws AlreadyClaimedError and emits failed with a link for tecOBJECT_NOT_FOUND", async () => {
    const { client } = mockClient({ final: "tecOBJECT_NOT_FOUND" });
    const accept: SubmittableTransaction = {
      TransactionType: "NFTokenAcceptOffer",
      Account: wallet.classicAddress,
      NFTokenSellOffer: "A".repeat(64),
    };
    const promise = submitTx(client, wallet, accept, { ...fast, kind: "subtask.claim" });
    await expect(promise).rejects.toBeInstanceOf(AlreadyClaimedError);
    expect(events.seen.map((e) => e.name)).toEqual(["tx.pending", "tx.failed"]);
    const failed = events.seen[1]!.payload as LedgerEventMap["tx.failed"];
    expect(failed).toMatchObject({
      kind: "subtask.claim",
      code: "tecOBJECT_NOT_FOUND",
      errorCode: "ALREADY_CLAIMED",
    });
    expect(failed.explorerUrl).toBe(`https://testnet.xrpl.org/transactions/${failed.hash}`);
  });

  it("fails at once on a tem preliminary result, without a link", async () => {
    const { client, calls } = mockClient({ preliminary: "temBAD_AMOUNT" });
    await expect(submitTx(client, wallet, payment(), fast)).rejects.toBeInstanceOf(
      InvalidTransactionError,
    );
    expect(calls).not.toContain("tx");
    const failed = events.seen[1]!.payload as LedgerEventMap["tx.failed"];
    expect(failed).toMatchObject({
      code: "temBAD_AMOUNT",
      errorCode: "INVALID_TX",
      explorerUrl: null,
    });
  });

  it("maps a tef preliminary result such as tefNFTOKEN_IS_NOT_TRANSFERABLE", async () => {
    const { client } = mockClient({ preliminary: "tefNFTOKEN_IS_NOT_TRANSFERABLE" });
    await expect(submitTx(client, wallet, payment(), fast)).rejects.toBeInstanceOf(NotAllowedError);
  });

  it("throws TxExpiredError when LastLedgerSequence passes without the transaction", async () => {
    const { client } = mockClient({ notFoundPolls: Number.POSITIVE_INFINITY });
    const error = await submitTx(client, wallet, payment(), fast).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxExpiredError);
    expect((error as TxExpiredError).hash).toMatch(/^[0-9A-F]{64}$/);
    expect(events.seen.at(-1)).toMatchObject({
      name: "tx.failed",
      payload: { errorCode: "TX_EXPIRED", explorerUrl: null },
    });
  });

  it("keeps polling by hash across a dropped connection", async () => {
    const { client, mock } = mockClient({
      txErrors: [new DisconnectedError("socket closed")],
    });
    await submitTx(client, wallet, payment(), fast);
    expect(mock.connect).toHaveBeenCalled();
    expect(events.seen.map((e) => e.name)).toEqual(["tx.pending", "tx.validated"]);
  });

  it("emits tx.unknown, not tx.failed, when the connection stays down past the deadline", async () => {
    const { client } = mockClient({
      txErrors: Array.from({ length: 10_000 }, () => new DisconnectedError("socket closed")),
    });
    const error = await submitTx(client, wallet, payment(), {
      ...fast,
      kind: "payout.accept",
      outcomeDeadlineMs: 20,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    const hash = (error as NetworkError).hash;
    expect(hash).toMatch(/^[0-9A-F]{64}$/);
    expect(events.seen.map((e) => e.name)).toEqual(["tx.pending", "tx.unknown"]);
    expect(events.seen[1]!.payload).toMatchObject({
      hash,
      kind: "payout.accept",
      errorCode: "NETWORK",
      explorerUrl: `https://testnet.xrpl.org/transactions/${hash}`,
    });
  });

  it("serializes sign and submit per account so Sequence numbers do not collide", async () => {
    const { client, calls, signed } = mockClient();
    await Promise.all([
      submitTx(client, wallet, payment(), fast),
      submitTx(client, wallet, payment(), fast),
    ]);
    const prepare = calls.filter((c) => c === "autofill" || c === "submit");
    expect(prepare).toEqual(["autofill", "submit", "autofill", "submit"]);
    expect(signed.map((s) => s.Sequence)).toEqual([10, 11]);
  });

  it("holds the account lock after terQUEUED until the transaction validates", async () => {
    const { client, calls, signed } = mockClient({
      preliminaries: ["terQUEUED", "tesSUCCESS"],
      notFoundPolls: 2,
    });
    await Promise.all([
      submitTx(client, wallet, payment(), fast),
      submitTx(client, wallet, payment(), fast),
    ]);
    // The second autofill waits for the validated first transaction, so it reads a new Sequence.
    const secondAutofill = calls.lastIndexOf("autofill");
    expect(calls.indexOf("tx")).toBeLessThan(secondAutofill);
    expect(signed.map((s) => s.Sequence)).toEqual([10, 11]);
  });

  it("holds the account lock when the submit outcome is unknown after a reconnect", async () => {
    const { client, calls, signed } = mockClient({
      submitErrors: [new DisconnectedError("socket closed"), new DisconnectedError("again")],
    });
    const first = submitTx(client, wallet, payment(), fast);
    const second = submitTx(client, wallet, payment(), fast);
    await Promise.all([first, second]);
    expect(calls.indexOf("tx")).toBeLessThan(calls.lastIndexOf("autofill"));
    // The first blob went out twice (the submit and its retry), and both answers were lost.
    expect(signed.map((s) => s.Sequence)).toEqual([10, 10, 11]);
  });

  it("releases the lock after a tes preliminary result, before validation", async () => {
    const { client, calls } = mockClient({ notFoundPolls: 3 });
    await Promise.all([
      submitTx(client, wallet, payment(), fast),
      submitTx(client, wallet, payment(), fast),
    ]);
    expect(calls.lastIndexOf("autofill")).toBeLessThan(calls.indexOf("tx"));
  });

  it("names a ter preliminary result such as terINSUF_FEE_B when the transaction expires", async () => {
    const { client } = mockClient({
      preliminary: "terINSUF_FEE_B",
      notFoundPolls: Number.POSITIVE_INFINITY,
    });
    const error = await submitTx(client, wallet, payment(), fast).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxExpiredError);
    expect((error as TxExpiredError).message).toContain("terINSUF_FEE_B");
  });

  it("lets different accounts submit in parallel", async () => {
    const { client, calls } = mockClient();
    const other = Wallet.generate();
    await Promise.all([
      submitTx(client, wallet, payment(), fast),
      submitTx(client, other, { ...payment(), Account: other.classicAddress }, fast),
    ]);
    expect(calls.slice(0, 2)).toEqual(["autofill", "autofill"]);
  });
});
