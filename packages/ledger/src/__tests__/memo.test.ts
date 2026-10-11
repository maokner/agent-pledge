import { describe, expect, it } from "vitest";
import { LedgerError } from "../errors.js";
import { fromHex, readTaskMemo, TASK_MEMO_TYPE, taskMemo, toHex } from "../memo.js";

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
