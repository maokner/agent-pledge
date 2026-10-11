import { describe, expect, it } from "vitest";
import { clockOffsetMs, formatMsLeft, msLeft } from "./clock";

const SERVER_TIME = "2026-10-11T19:00:00.000Z";
const DEADLINE = "2026-10-11T19:03:00.000Z";

describe("server-corrected countdown", () => {
  it("counts from the server clock when the phone clock is 2 minutes slow", () => {
    const phoneNow = Date.parse(SERVER_TIME) - 2 * 60_000;
    const offset = clockOffsetMs(SERVER_TIME, phoneNow);

    expect(msLeft(DEADLINE, phoneNow, offset)).toBe(3 * 60_000);
    expect(msLeft(DEADLINE, phoneNow + 60_000, offset)).toBe(2 * 60_000);
  });

  it("never goes below zero", () => {
    expect(msLeft(DEADLINE, Date.parse(DEADLINE) + 5_000, 0)).toBe(0);
  });

  it("treats an unreadable server time as no offset", () => {
    expect(clockOffsetMs("not a time", 1_000)).toBe(0);
  });
});

describe("formatMsLeft", () => {
  it("shows m:ss, rounding up so 0:00 means the time is really up", () => {
    expect(formatMsLeft(3 * 60_000)).toBe("3:00");
    expect(formatMsLeft(61_500)).toBe("1:02");
    expect(formatMsLeft(400)).toBe("0:01");
    expect(formatMsLeft(0)).toBe("0:00");
  });

  it("adds hours for long tasks", () => {
    expect(formatMsLeft(3_909_000)).toBe("1:05:09");
  });
});
