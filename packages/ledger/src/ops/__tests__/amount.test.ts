import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import {
  addIouValues,
  compareIouValues,
  formatIouValue,
  isZeroIouValue,
  normalizeLedgerValue,
  subtractIouValues,
  tokenAmount,
} from "../amount.js";

describe("formatIouValue", () => {
  it.each([
    ["5", "5"],
    ["4", "4"],
    ["1", "1"],
    ["6", "6"],
    ["5.00", "5"],
    ["0.50", "0.5"],
    ["4.25", "4.25"],
    ["007", "7"],
    ["0", "0"],
    ["0.000", "0"],
    [" 3 ", "3"],
  ])("formats %j as %j", (input, output) => {
    expect(formatIouValue(input)).toBe(output);
  });

  it("accepts bigints and safe integers", () => {
    expect(formatIouValue(4n)).toBe("4");
    expect(formatIouValue(6)).toBe("6");
  });

  it("rejects floats, so no binary rounding can reach the ledger", () => {
    expect(() => formatIouValue(4.5)).toThrow(TypeError);
    expect(() => formatIouValue(0.1 + 0.2)).toThrow(TypeError);
  });

  it.each(["-1", "1e3", "1.", ".5", "", "abc", "1,000", "NaN"])("rejects %j", (input) => {
    expect(() => formatIouValue(input)).toThrow();
  });

  it("rejects negative bigints and numbers", () => {
    expect(() => formatIouValue(-1n)).toThrow(RangeError);
    expect(() => formatIouValue(-1)).toThrow(TypeError);
  });

  it("rejects more than 15 significant digits", () => {
    expect(formatIouValue("123456789012345")).toBe("123456789012345");
    expect(formatIouValue("0.000123456789012345")).toBe("0.000123456789012345");
    expect(() => formatIouValue("1234567890123456")).toThrow(RangeError);
  });
});

describe("addIouValues", () => {
  it("adds exactly", () => {
    expect(addIouValues("5", "1")).toBe("6");
    expect(addIouValues("0.1", "0.2")).toBe("0.3");
    expect(addIouValues("4.50", "0.5")).toBe("5");
    expect(addIouValues("5", 1n, 0)).toBe("6");
    expect(addIouValues()).toBe("0");
  });
});

describe("compareIouValues and isZeroIouValue", () => {
  it("compares across scales", () => {
    expect(compareIouValues("4", "4.0")).toBe(0);
    expect(compareIouValues("4", "4.01")).toBe(-1);
    expect(compareIouValues("101", "99")).toBe(1);
    expect(isZeroIouValue("0.00")).toBe(true);
    expect(isZeroIouValue("0.01")).toBe(false);
  });
});

describe("tokenAmount", () => {
  const issuer = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
  const config = loadConfig({
    XRPL_TOKEN_ISSUER: issuer,
    XRPL_TOKEN_CURRENCY: "USD",
  } as NodeJS.ProcessEnv);

  it("builds an issued currency amount from the config", () => {
    expect(tokenAmount(config, "5.00")).toEqual({
      currency: "USD",
      issuer,
      value: "5",
    });
  });

  it("rejects zero, which rippled rejects as temBAD_AMOUNT", () => {
    expect(() => tokenAmount(config, "0")).toThrow(RangeError);
  });
});

describe("subtractIouValues", () => {
  it("subtracts exactly", () => {
    expect(subtractIouValues("6", "1")).toBe("5");
    expect(subtractIouValues("4.5", "0.25")).toBe("4.25");
    expect(subtractIouValues("1", "1")).toBe("0");
  });

  it("rejects a negative result", () => {
    expect(() => subtractIouValues("1", "6")).toThrow(RangeError);
  });
});

describe("normalizeLedgerValue", () => {
  it.each([
    ["5", "5"],
    ["4.50", "4.5"],
    ["1e-7", "0.0000001"],
    ["1.5e3", "1500"],
    ["12.5e-1", "1.25"],
    ["25e0", "25"],
  ])("normalizes %j to %j", (input, output) => {
    expect(normalizeLedgerValue(input)).toBe(output);
  });

  it.each(["-5", "abc", ""])("returns undefined for %j", (input) => {
    expect(normalizeLedgerValue(input)).toBeUndefined();
  });
});
