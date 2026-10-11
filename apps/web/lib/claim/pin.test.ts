import { describe, expect, it } from "vitest";
import { attemptsLeftHint, pinFeedback, sanitizePin } from "./pin";

describe("sanitizePin", () => {
  it("keeps only the first 4 digits of whatever the keyboard or paste gives", () => {
    expect(sanitizePin("4821")).toBe("4821");
    expect(sanitizePin("48 21")).toBe("4821");
    expect(sanitizePin("PIN: 4821-99")).toBe("4821");
    expect(sanitizePin("４８")).toBe("");
  });
});

describe("pinFeedback", () => {
  it("counts down the attempts after a wrong PIN, in the issue's words", () => {
    expect(pinFeedback("wrong", 2)).toBe("Wrong PIN, 2 attempts left");
    expect(pinFeedback("wrong", 1)).toBe("Wrong PIN, 1 attempt left");
  });

  it("says Locked after the third wrong PIN", () => {
    expect(pinFeedback("locked", 0)).toBe("Locked");
  });

  it("says nothing for the correct PIN", () => {
    expect(pinFeedback("correct", 3)).toBeNull();
  });
});

describe("attemptsLeftHint", () => {
  it("stays quiet before any wrong PIN", () => {
    expect(attemptsLeftHint(3)).toBeNull();
  });

  it("warns when attempts were used, for example after a reload", () => {
    expect(attemptsLeftHint(2)).toBe("2 attempts left.");
    expect(attemptsLeftHint(1)).toBe("1 attempt left. One more wrong PIN locks this task.");
  });
});
