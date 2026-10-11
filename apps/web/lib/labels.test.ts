import { describe, expect, it } from "vitest";
import { failureText } from "./labels";

describe("failureText", () => {
  it("uses the board's words for a reason it knows", () => {
    expect(failureText({ failure_reason: "pin_locked", fail_reason: "No correct PIN before the time limit" })).toBe(
      "Three wrong PINs locked the sub-task",
    );
  });

  it("falls back to the server's own words", () => {
    expect(failureText({ failure_reason: null, fail_reason: "Failed by the operator" })).toBe("Failed by the operator");
  });

  it("is null when there is no reason", () => {
    expect(failureText({ failure_reason: null })).toBeNull();
    expect(failureText({ failure_reason: null, fail_reason: "" })).toBeNull();
  });
});
