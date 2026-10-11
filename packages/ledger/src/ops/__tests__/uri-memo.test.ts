import { describe, expect, it } from "vitest";
import { buildMemos, encodeMemo, readMemos } from "../memo.js";
import { decodeNftUri, encodeNftUri, MAX_NFT_URI_BYTES } from "../uri.js";

describe("encodeNftUri", () => {
  it("hex-encodes the URL exactly as given", () => {
    expect(encodeNftUri("https://example.com/a")).toBe(
      "68747470733A2F2F6578616D706C652E636F6D2F61",
    );
    const url = "https://board.example/api/nft/subtasks/demo-1-s1?v=2";
    expect(decodeNftUri(encodeNftUri(url))).toBe(url);
  });

  it("allows exactly 256 bytes and rejects more", () => {
    const prefix = "https://example.com/";
    const atLimit = prefix + "a".repeat(MAX_NFT_URI_BYTES - prefix.length);
    expect(encodeNftUri(atLimit)).toHaveLength(MAX_NFT_URI_BYTES * 2);
    expect(() => encodeNftUri(`${atLimit}a`)).toThrow(RangeError);
  });

  it.each(["/api/nft/tasks/1", "not a url", "https://example.com/a b", "ftp://example.com/x", ""])(
    "rejects %j",
    (url) => {
      expect(() => encodeNftUri(url)).toThrow(TypeError);
    },
  );
});

describe("memos", () => {
  it("encodes MemoType agent-pledge/task and MemoData as hex", () => {
    expect(encodeMemo("agent-pledge/task", "task-42")).toEqual({
      Memo: {
        MemoType: Buffer.from("agent-pledge/task").toString("hex").toUpperCase(),
        MemoData: Buffer.from("task-42").toString("hex").toUpperCase(),
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

  it("rejects empty IDs", () => {
    expect(() => buildMemos({ task: "" })).toThrow(TypeError);
  });
});
