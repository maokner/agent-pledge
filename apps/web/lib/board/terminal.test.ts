import { describe, expect, it } from "vitest";
import { asciiBar, edgeTag, pendingFraction, timeLeftFraction, txTag, workTag, wrapWithContinuation } from "./terminal";

describe("edgeTag", () => {
  it("names each money-tree edge state in text, so the tree never relies on color", () => {
    expect(edgeTag("planned")).toEqual({ tag: "[--]", word: null, tone: "planned" });
    expect(edgeTag("pending")).toEqual({ tag: "[..]", word: null, tone: "pending" });
    expect(edgeTag("settled")).toEqual({ tag: "[HELD]", word: null, tone: "claimed" });
    expect(edgeTag("paid")).toEqual({ tag: "[OK]", word: null, tone: "validated" });
    expect(edgeTag("returned")).toEqual({ tag: "[RFND]", word: "↩", tone: "refund" });
    expect(edgeTag("failed")).toEqual({ tag: "[ERR]", word: null, tone: "failed" });
  });
});

describe("timeLeftFraction", () => {
  const deadline = "2026-10-11T12:03:00.000Z";
  const at = (iso: string) => Date.parse(iso);

  it("is the share of the time limit still left", () => {
    expect(timeLeftFraction(deadline, 3, at("2026-10-11T12:00:00.000Z"))).toBe(1);
    expect(timeLeftFraction(deadline, 3, at("2026-10-11T12:01:30.000Z"))).toBe(0.5);
  });

  it("is 0 after the deadline and full before the clock starts", () => {
    expect(timeLeftFraction(deadline, 3, at("2026-10-11T12:05:00.000Z"))).toBe(0);
    expect(timeLeftFraction(deadline, 3, null)).toBe(1);
  });
});

describe("workTag", () => {
  it("gives every work status its tag from the board status map", () => {
    expect(workTag("open")).toEqual({ tag: "[OPEN]", word: null, tone: "open" });
    expect(workTag("claimed")).toEqual({ tag: "[CLAIMED]", word: null, tone: "claimed" });
    expect(workTag("done")).toEqual({ tag: "[DONE]", word: null, tone: "done" });
  });

  it("shows a failure as [ERR] and the word FAILED", () => {
    expect(workTag("failed")).toEqual({ tag: "[ERR]", word: "FAILED", tone: "failed" });
  });
});

describe("txTag", () => {
  it("shows pending as [..], validated as [OK] and failed as [ERR] FAILED", () => {
    expect(txTag({ status: "pending", kind: "task_escrow" })).toEqual({ tag: "[..]", word: "PENDING", tone: "pending" });
    expect(txTag({ status: "validated", kind: "helper_payout" })).toEqual({ tag: "[OK]", word: null, tone: "validated" });
    expect(txTag({ status: "failed", kind: "helper_payout" })).toEqual({ tag: "[ERR]", word: "FAILED", tone: "failed" });
  });

  it("marks a validated refund [RFND] with a return arrow", () => {
    expect(txTag({ status: "validated", kind: "requester_refund" })).toEqual({ tag: "[RFND]", word: "↩", tone: "refund" });
    expect(txTag({ status: "validated", kind: "agent_refund" })).toEqual({ tag: "[RFND]", word: "↩", tone: "refund" });
  });

  it("still shows a refund that is pending or failed by its tx status", () => {
    expect(txTag({ status: "pending", kind: "requester_refund" }).tag).toBe("[..]");
    expect(txTag({ status: "failed", kind: "agent_refund" }).tag).toBe("[ERR]");
  });
});

describe("asciiBar", () => {
  it("draws filled cells as | and empty cells as .", () => {
    expect(asciiBar(0.375, 8)).toBe("[|||.....]");
    expect(asciiBar(0, 4)).toBe("[....]");
    expect(asciiBar(1, 4)).toBe("[||||]");
  });

  it("clamps fractions outside 0..1, and treats NaN as empty", () => {
    expect(asciiBar(-0.5, 4)).toBe("[....]");
    expect(asciiBar(3, 4)).toBe("[||||]");
    expect(asciiBar(Number.NaN, 4)).toBe("[....]");
  });
});

describe("wrapWithContinuation", () => {
  it("leaves a line that fits alone", () => {
    expect(wrapWithContinuation("ABC", 4)).toEqual(["ABC"]);
    expect(wrapWithContinuation("ABCD", 4)).toEqual(["ABCD"]);
  });

  it("ends every wrapped line with \\ and keeps each line within the width", () => {
    expect(wrapWithContinuation("ABCDEFGHIJ", 4)).toEqual(["ABC\\", "DEF\\", "GHIJ"]);
    expect(wrapWithContinuation("C53ECF838647D1C4", 8)).toEqual(["C53ECF8\\", "38647D1\\", "C4"]);
  });

  it("gives an empty string one empty line", () => {
    expect(wrapWithContinuation("", 4)).toEqual([""]);
  });
});

describe("pendingFraction", () => {
  const submitted = "2026-10-11T12:00:00.000Z";
  const at = (ms: number) => Date.parse(submitted) + ms;

  it("fills over the ledger's usual close time (about 4 s)", () => {
    expect(pendingFraction(submitted, at(0))).toBe(0);
    expect(pendingFraction(submitted, at(2000))).toBe(0.5);
  });

  it("stops short of full while still pending, so only a validated tx shows a full bar", () => {
    expect(pendingFraction(submitted, at(4000))).toBe(0.9);
    expect(pendingFraction(submitted, at(60_000))).toBe(0.9);
  });

  it("is 0 before the clock starts, for a bad date, or for a clock behind the server", () => {
    expect(pendingFraction(submitted, null)).toBe(0);
    expect(pendingFraction("not a date", at(1000))).toBe(0);
    expect(pendingFraction(submitted, at(-5000))).toBe(0);
  });
});
