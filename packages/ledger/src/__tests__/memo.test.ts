import { describe, expect, it } from "vitest";
import { LedgerError } from "../errors.js";
import {
  buildMemos,
  checkProofSha256,
  encodeMemo,
  MEMO_TYPES,
  fromHex,
  readMemos,
  readTaskMemo,
  TASK_MEMO_TYPE,
  taskMemo,
  toHex,
} from "../memo.js";

describe("taskMemo", () => {
  it("hex encodes the type, data, and format", () => {
    expect(taskMemo("task_42")).toEqual([
      {
        Memo: {
          MemoType: "6167656E742D706C656467652F7461736B",
          MemoData: "7461736B5F3432",
          MemoFormat: "746578742F706C61696E",
        },
      },
    ]);
    expect(fromHex("6167656E742D706C656467652F7461736B")).toBe(TASK_MEMO_TYPE);
  });

  it("round trips UTF-8 task IDs", () => {
    const id = "tâche-☕-01HZX";
    expect(readTaskMemo({ Memos: taskMemo(id) })).toBe(id);
  });

  it.each(["", " padded", "padded ", "x".repeat(257)])("rejects %j", (id) => {
    expect(() => taskMemo(id)).toThrow(LedgerError);
  });
});

describe("readTaskMemo", () => {
  const memos = taskMemo("t1");

  it("reads a plain transaction, a tx response, its result, and a stream message", () => {
    expect(readTaskMemo({ TransactionType: "Payment", Memos: memos })).toBe("t1");
    expect(readTaskMemo({ result: { tx_json: { Memos: memos } } })).toBe("t1");
    expect(readTaskMemo({ tx_json: { Memos: memos } })).toBe("t1");
    expect(readTaskMemo({ tx: { Memos: memos } })).toBe("t1");
  });

  it("finds the task memo among other memos and accepts lower-case hex", () => {
    const other = { Memo: { MemoType: toHex("other"), MemoData: toHex("x") } };
    const lower = {
      Memo: { MemoType: toHex(TASK_MEMO_TYPE).toLowerCase(), MemoData: toHex("t2").toLowerCase() },
    };
    expect(readTaskMemo({ Memos: [other, lower] })).toBe("t2");
  });

  it("returns null without a task memo or with bad data", () => {
    expect(readTaskMemo({})).toBeNull();
    expect(readTaskMemo({ Memos: [] })).toBeNull();
    expect(readTaskMemo({ Memos: "nope" })).toBeNull();
    expect(
      readTaskMemo({ Memos: [{ Memo: { MemoType: toHex("other"), MemoData: "00" } }] }),
    ).toBeNull();
    expect(
      readTaskMemo({ Memos: [{ Memo: { MemoType: toHex(TASK_MEMO_TYPE), MemoData: "XYZ" } }] }),
    ).toBeNull();
  });
});

describe("memos", () => {
  it("encodes MemoType agent-pledge/task and MemoData as hex", () => {
    expect(encodeMemo("agent-pledge/task", "task-42")).toEqual({
      Memo: {
        MemoType: Buffer.from("agent-pledge/task").toString("hex").toUpperCase(),
        MemoData: Buffer.from("task-42").toString("hex").toUpperCase(),
        MemoFormat: Buffer.from("text/plain").toString("hex").toUpperCase(),
      },
    });
  });

  it("round-trips fields and leaves out undefined ones", () => {
    const memos = buildMemos({ task: "t1", subtask: undefined, action: "refund" });
    expect(memos).toHaveLength(2);
    expect(readMemos(memos)).toEqual({ task: "t1", action: "refund" });
  });

  it("ignores memos from other apps and malformed memos", () => {
    const memos = [
      encodeMemo("other-app/id", "x"),
      { Memo: { MemoType: "ZZ", MemoData: "00" } },
      { Memo: {} },
      ...buildMemos({ subtask: "s1" }),
    ];
    expect(readMemos(memos)).toEqual({ subtask: "s1" });
    expect(readMemos(undefined)).toEqual({});
  });

  it("rejects empty values and bad IDs with INVALID_INPUT", () => {
    expect(() => buildMemos({ task: "" })).toThrow(LedgerError);
    expect(() => buildMemos({ action: "" })).toThrow(LedgerError);
    expect(() => buildMemos({ subtask: " s1" })).toThrow(LedgerError);
    expect(() => buildMemos({ subtask: "s".repeat(257) })).toThrow(LedgerError);
  });

  it("reads the task memo that taskMemo writes, so both views agree", () => {
    expect(readMemos(taskMemo("t9"))).toEqual({ task: "t9" });
    expect(readTaskMemo({ Memos: buildMemos({ task: "t9", action: "refund" }) })).toBe("t9");
  });
});

describe("proof memo", () => {
  const sha = "ab".repeat(32);

  it("writes agent-pledge/proof after the action memo, and readMemos returns it", () => {
    const memos = buildMemos({ task: "t1", subtask: "s1", action: "payout.offer", proof: sha });
    expect(memos).toHaveLength(4);
    expect(memos[3]).toEqual(encodeMemo(MEMO_TYPES.proof, sha));
    expect(fromHex(memos[3]!.Memo.MemoType!)).toBe("agent-pledge/proof");
    expect(readMemos(memos)).toEqual({
      task: "t1",
      subtask: "s1",
      action: "payout.offer",
      proof: sha,
    });
  });

  it("writes the hash in lower case", () => {
    const memos = buildMemos({ proof: sha.toUpperCase() });
    expect(readMemos(memos)).toEqual({ proof: sha });
    expect(checkProofSha256("AB".repeat(32))).toBe(sha);
  });

  it.each([
    ["empty", ""],
    ["63 hex characters", "a".repeat(63)],
    ["65 hex characters", "a".repeat(65)],
    ["a non-hex character", `${"a".repeat(63)}g`],
    ["outer whitespace", ` ${"a".repeat(64)}`],
    ["a 0x prefix", `0x${"a".repeat(62)}`],
  ])("rejects a proof with %s with INVALID_INPUT", (_, value) => {
    expect(() => buildMemos({ proof: value })).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => checkProofSha256(value)).toThrow(LedgerError);
  });
});
