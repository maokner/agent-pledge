import { describe, expect, it } from "vitest";
import { loadAssets } from "../src/assets.js";

const { systemPrompt, firstMessage } = loadAssets();
const REFUSAL = "Right now I can only save seats.";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("system prompt", () => {
  it("contains the refusal sentence verbatim", () => {
    expect(systemPrompt).toContain(`"${REFUSAL}"`);
  });

  it("limits the base demo to seat holds", () => {
    expect(systemPrompt).toMatch(/only job you can take is saving a seat/);
    expect(systemPrompt).toMatch(/Do not create a task that is not a seat hold/);
  });

  it("collects all four values", () => {
    for (const value of ["The task:", "The place:", "The time limit:", "The maximum price:"]) {
      expect(systemPrompt).toContain(value);
    }
  });

  it("never invents a price and asks for one", () => {
    expect(systemPrompt).toContain(
      "Never make up a price, suggest a price, or use a default price.",
    );
    expect(systemPrompt).toContain('"What is the most you will pay, in dollars?"');
  });

  it("repeats the values and waits for a yes before create_task", () => {
    expect(systemPrompt).toContain("Repeat all four values");
    expect(systemPrompt).toContain(
      "Do not call create_task until the caller says yes to the full summary.",
    );
  });

  it("says the PIN two times, digit by digit, from the tool result only", () => {
    expect(systemPrompt).toContain("Say the PIN two times, one digit at a time");
    expect(systemPrompt).toContain('"Your PIN is D1, D2, D3, D4. Again: D1, D2, D3, D4."');
    expect(count(systemPrompt, "D1, D2, D3, D4")).toBe(2);
    expect(systemPrompt).toContain(
      "Read the PIN only from the pin field of the create_task result.",
    );
  });

  it("contains no concrete 4-digit number that the model could read as a PIN", () => {
    expect(systemPrompt).not.toMatch(/\b\d{4}\b/);
  });

  it("gives the board URL from the tool result", () => {
    expect(systemPrompt).toContain("board_url");
  });

  it("handles a tool error without a PIN and offers to try again", () => {
    expect(systemPrompt).toContain("do not say a PIN");
    expect(systemPrompt).toContain(
      '"Sorry, something went wrong on our side. Do you want me to try again?"',
    );
  });

  it("keeps turns short for speakerphone", () => {
    expect(systemPrompt).toContain("Keep every turn short: one or two short sentences.");
    expect(systemPrompt).toMatch(/speakerphone/);
  });

  it("does not ask for the phone number, which comes from the caller ID", () => {
    expect(systemPrompt).toContain("Never ask the caller for their phone number.");
  });

  it("names both server tools", () => {
    expect(systemPrompt).toContain("## create_task");
    expect(systemPrompt).toContain("## task_status");
  });

  it("uses no {{dynamic variable}} syntax, so a call never fails on a missing variable", () => {
    expect(systemPrompt).not.toContain("{{");
    expect(firstMessage).not.toContain("{{");
  });
});

describe("first message", () => {
  it("is short, says who is calling, and asks what the caller needs", () => {
    expect(firstMessage.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(firstMessage).toContain("Agent Pledge");
    expect(firstMessage.endsWith("?")).toBe(true);
    expect(firstMessage).not.toContain("\n");
  });
});
