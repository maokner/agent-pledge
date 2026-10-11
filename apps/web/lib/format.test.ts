import { describe, expect, it } from "vitest";
import {
  explorerAccountUrl,
  explorerNftUrl,
  explorerTxUrl,
  formatMinutes,
  formatRlusd,
  formatSignedRlusd,
  formatTimeLeft,
  shortHash,
} from "./format";

describe("formatRlusd", () => {
  it("shows a whole RLUSD amount as dollars with cents", () => {
    expect(formatRlusd("5")).toBe("$5.00");
  });

  it("pads fractional amounts to cents", () => {
    expect(formatRlusd("4.5")).toBe("$4.50");
    expect(formatRlusd("0.5")).toBe("$0.50");
  });

  it("groups thousands", () => {
    expect(formatRlusd("1234.5")).toBe("$1,234.50");
  });

  it("shows a dash instead of $NaN for a malformed amount", () => {
    expect(formatRlusd("")).toBe("—");
    expect(formatRlusd("abc")).toBe("—");
  });
});

describe("formatSignedRlusd", () => {
  it("shows gains with a plus and losses with a minus sign", () => {
    expect(formatSignedRlusd("1")).toBe("+$1.00");
    expect(formatSignedRlusd("-1")).toBe("−$1.00");
    expect(formatSignedRlusd("-4.5")).toBe("−$4.50");
  });

  it("shows zero with no sign", () => {
    expect(formatSignedRlusd("0")).toBe("$0.00");
  });
});

describe("formatMinutes", () => {
  it("shows a time limit in minutes or hours", () => {
    expect(formatMinutes(1)).toBe("1 min");
    expect(formatMinutes(3)).toBe("3 min");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});

const HASH = "C53ECF838647FA5A4C780377025FEC7999AB4182590510CA461444B207AB4A7E";

describe("explorer links", () => {
  it("links a transaction to the XRPL testnet explorer by default", () => {
    expect(explorerTxUrl(HASH)).toBe(`https://testnet.xrpl.org/transactions/${HASH}`);
  });

  it("links accounts and NFTs on the same explorer", () => {
    expect(explorerAccountUrl("rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV")).toBe(
      "https://testnet.xrpl.org/accounts/rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV",
    );
    expect(explorerNftUrl(HASH)).toBe(`https://testnet.xrpl.org/nft/${HASH}`);
  });

  it("uses another explorer base when given one, ignoring a trailing slash", () => {
    expect(explorerTxUrl(HASH, "https://livenet.xrpl.org/")).toBe(
      `https://livenet.xrpl.org/transactions/${HASH}`,
    );
  });
});

describe("shortHash", () => {
  it("keeps the first 6 and last 4 characters", () => {
    expect(shortHash(HASH)).toBe("C53ECF…4A7E");
  });

  it("leaves short strings alone", () => {
    expect(shortHash("ABC123")).toBe("ABC123");
  });
});

describe("formatTimeLeft", () => {
  const now = Date.parse("2026-10-11T19:00:00.000Z");

  it("shows minutes and seconds until the deadline", () => {
    expect(formatTimeLeft("2026-10-11T19:02:31.000Z", now)).toBe("2:31");
    expect(formatTimeLeft("2026-10-11T19:00:05.400Z", now)).toBe("0:05");
  });

  it("shows hours when the deadline is an hour or more away", () => {
    expect(formatTimeLeft("2026-10-11T20:05:09.000Z", now)).toBe("1:05:09");
  });

  it("shows 0:00 once the deadline has passed", () => {
    expect(formatTimeLeft("2026-10-11T18:59:00.000Z", now)).toBe("0:00");
  });
});
