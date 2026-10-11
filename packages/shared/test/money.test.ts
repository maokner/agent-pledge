import { describe, expect, it } from "vitest";
import {
  CODE_REGEX,
  fromCents,
  newCode,
  newId,
  normalizeCode,
  normalizeMoney,
  subtaskPriceCents,
  toCents,
} from "../src";

describe("money", () => {
  it("converts between cents and strings", () => {
    expect(toCents("5.00")).toBe(500);
    expect(toCents("5.5")).toBe(550);
    expect(toCents(5)).toBe(500);
    expect(toCents("$4")).toBe(400);
    expect(fromCents(600)).toBe("6.00");
    expect(fromCents(5)).toBe("0.05");
    expect(normalizeMoney(4.5)).toBe("4.50");
    expect(() => toCents("abc")).toThrow();
    expect(() => toCents("1.234")).toThrow();
  });
  it("computes the base-demo sub-task price", () => {
    expect(subtaskPriceCents(500)).toBe(400);
    expect(subtaskPriceCents(700)).toBe(550);
    expect(subtaskPriceCents(1000)).toBe(800);
  });
});

describe("ids", () => {
  it("makes prefixed ids and 4-char codes", () => {
    expect(newId("task")).toMatch(/^task_[0-9a-z]{16}$/);
    expect(newCode()).toMatch(CODE_REGEX);
    expect(normalizeCode(" 7q2k")).toBe("7Q2K");
    expect(normalizeCode("O0I1")).toBeNull();
  });
});
