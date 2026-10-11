import { describe, expect, it } from "vitest";
import { loadAssets } from "../src/assets.js";

const { systemPrompt, firstMessage } = loadAssets();
const REFUSAL =
  "I can look into that, but right now the only thing I can lock in is saving a seat.";

/** The text of a markdown section, from its heading to the next heading of the same or a higher level. */
function section(markdown: string, heading: string): string {
  const level = heading.split(" ")[0] as string;
  const start = markdown.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`no section ${heading}`);
  const rest = markdown.slice(start + heading.length + 2);
  const end = rest.search(new RegExp(`^#{1,${level.length}} `, "m"));
  return end < 0 ? rest : rest.slice(0, end);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("system prompt", () => {
  it("contains the refusal sentence verbatim", () => {
    expect(systemPrompt).toContain(`"${REFUSAL}"`);
  });

  it("limits the base demo to seat holds", () => {
    expect(systemPrompt).toMatch(/one job you can lock in on the ledger today is saving a seat/);
    expect(systemPrompt).toMatch(/Do not create a task that is not a seat hold/);
  });

  it("defines a seat hold narrowly and names what is not one", () => {
    expect(systemPrompt).toContain(
      "A seat hold is a request to save a seat or a chair at a table, at a desk, or in a room, for the caller.",
    );
    expect(systemPrompt).toContain(
      "These are not seat holds: a spot in a line or a queue, a parking spot, and any add-on to the seat, for example coffee, food, or printing.",
    );
    expect(systemPrompt).not.toMatch(/a seat, a spot, or a place/);
  });

  it("refuses an add-on with the exact sentence and offers only the seat hold", () => {
    expect(systemPrompt).toContain(
      "If the caller asks for a seat hold and also for an add-on, say exactly the same sentence, then offer to do only the seat hold.",
    );
    expect(systemPrompt).toContain(`"${REFUSAL} Want me to grab just the seat?"`);
  });

  it("keeps add-ons out of the description", () => {
    expect(systemPrompt).toContain(
      '- description: only the seat hold, in a few words, for example "Save one seat". Never put an add-on, the place, the time, or the price in it.',
    );
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

  it("requires a whole time limit of at least 1 minute, rounded up, and tells the caller", () => {
    expect(systemPrompt).toContain(
      "3. The time limit: how many whole minutes from now the seat must be saved, at least 1 minute.",
    );
    expect(systemPrompt).toContain(
      'If the caller says "right now", "as soon as possible", or "as fast as you can", use 2 minutes.',
    );
    expect(systemPrompt).toMatch(/round it up to the next whole minute/);
    expect(systemPrompt).toMatch(/"a minute and a half" or "90 seconds" becomes 2 minutes/);
    expect(systemPrompt).toContain('"I will make that 2 minutes. Is that OK?"');
    expect(systemPrompt).toContain(
      "- time_limit_minutes: the time limit from the summary, as a whole number of minutes, at least 1.",
    );
  });

  it("re-asks an invalid value instead of saying that the service is down", () => {
    const invalid = section(systemPrompt, "## Invalid input");
    expect(invalid).toContain('If create_task returns the error "invalid_input"');
    expect(invalid).toContain("Ask the caller for that value again");
    expect(invalid).toContain("Then call create_task again.");
    expect(invalid).toContain("do not say that the service is down");
    expect(invalid).not.toContain("Do you want me to try again?");
  });

  it("retries any other error once, then apologizes", () => {
    const other = section(systemPrompt, "## Any other error");
    expect(other).toContain("If a tool returns any other error");
    expect(other).toContain("call the tool one more time with the same values");
    expect(other).toContain('"Sorry, it is still not working. Please call back in a few minutes."');
  });

  it("never asks the caller to confirm the values", () => {
    expect(systemPrompt).toContain('Do not repeat the values back and do not ask "is that right".');
    expect(systemPrompt).toContain("Never ask the caller to confirm them.");
    expect(systemPrompt).toContain('say exactly: "Sure thing, gotcha covered."');
  });

  it("says the PIN once, digit by digit, from the tool result only, then ends the call", () => {
    expect(systemPrompt).toContain("Say it once, one digit at a time");
    expect(systemPrompt).toContain('"Your PIN is D1, D2, D3, D4. Later!"');
    expect(systemPrompt).toContain("Then end the call right away with the end_call tool.");
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

  it("keeps turns short for speakerphone, with the PIN turn as the one exception", () => {
    expect(systemPrompt).toContain("Keep every turn short: one or two short sentences.");
    expect(systemPrompt).toContain(
      "The one exception is the turn after create_task gives you a PIN, in step 7.",
    );
    expect(systemPrompt).toMatch(/speakerphone/);
  });

  it("does not ask for the phone number, which comes from the caller ID", () => {
    expect(systemPrompt).toContain("Never ask the caller for their phone number.");
  });

  it("creates at most one task in a call, because the server dedupes on the call id", () => {
    expect(systemPrompt).toContain("You can create only one task in a call.");
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
    expect(firstMessage.split(/(?<=[.?!])\s+/)).toHaveLength(2);
    expect(firstMessage).toContain("Pledge");
    expect(firstMessage.endsWith("?")).toBe(true);
    expect(firstMessage).not.toContain("\n");
  });
});
