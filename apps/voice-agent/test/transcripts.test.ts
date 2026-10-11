import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readText } from "../src/assets.js";
import {
  createTaskInputSchema,
  createTaskOutputSchema,
  taskStatusOutputSchema,
} from "../src/contract.js";
import { loadAssets } from "../src/assets.js";
import {
  SAMPLE_CALLER_PHONE,
  SAMPLE_NORMAL_CALL,
  SAMPLE_NO_PRICE_CALL,
  SAMPLE_RIGHT_NOW_CALL,
  SAMPLE_SEAT_AND_COFFEE_CALL,
  SAMPLE_SERVER_ERROR_CALL,
} from "../src/samples.js";
import { packagePath } from "../src/paths.js";
import { parseTranscript, type TranscriptEvent } from "./transcript-parser.js";

const REFUSAL =
  "I can look into that, but right now the only thing I can lock in is saving a seat.";
const { firstMessage } = loadAssets();

const load = (file: string) => parseTranscript(readText("transcripts", file));
const agentLines = (events: TranscriptEvent[]) =>
  events.flatMap((e) => (e.kind === "agent" ? [e.text] : []));
const toolCalls = (events: TranscriptEvent[], name: string) =>
  events.flatMap((e) => (e.kind === "tool_call" && e.name === name ? [e.args] : []));

/** "4821" becomes "4, 8, 2, 1". */
const spoken = (pin: string) => pin.split("").join(", ");

function successfulPin(events: TranscriptEvent[]): string {
  const result = events.find((e) => e.kind === "tool_result" && e.status === 200);
  if (result?.kind !== "tool_result") throw new Error("no successful tool result");
  return createTaskOutputSchema.parse(result.body).pin;
}

const MAX_TURN_WORDS = 30;

const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).filter((t) => t.length > 0);
const words = (text: string) => text.split(/\s+/).length;
const isSummary = (text: string) => text.startsWith("To confirm:");

/** The summary from step 5 of the prompt, for the values that create_task sends. */

/** Step 7 of the prompt: the PIN once, then the call ends. */
function pinTurn(pin: string, _boardUrl: string): string {
  return `Your PIN is ${spoken(pin)}. Later!`;
}

/** The agent turn right after a successful create_task result. */
function isPinTurn(events: TranscriptEvent[], i: number): boolean {
  const previous = events[i - 1];
  const call = events[i - 2];
  return (
    events[i]?.kind === "agent" &&
    previous?.kind === "tool_result" &&
    previous.status === 200 &&
    call?.kind === "tool_call" &&
    call.name === "create_task"
  );
}

const FILES = [
  "01-normal-call.md",
  "02-no-price.md",
  "03-not-a-seat.md",
  "04-server-error.md",
  "05-right-now.md",
  "06-seat-and-coffee.md",
];

describe("every transcript", () => {
  it("is listed", () => {
    expect(
      readdirSync(packagePath("transcripts"))
        .filter((f) => /^\d\d-/.test(f))
        .sort(),
    ).toEqual(FILES);
  });

  it.each(FILES)("%s starts with the first message and ends the call", (file) => {
    const events = load(file);
    expect(events[0]).toEqual({ kind: "agent", text: firstMessage });
    expect(events.at(-1)).toEqual({ kind: "tool_call", name: "end_call", args: {} });
  });

  it.each(FILES)("%s keeps agent turns to one or two short sentences", (file) => {
    const events = load(file);
    events.forEach((e, i) => {
      if (e.kind !== "agent" || isPinTurn(events, i) || isSummary(e.text)) return;
      expect(sentences(e.text).length, e.text).toBeLessThanOrEqual(2);
      expect(words(e.text), e.text).toBeLessThanOrEqual(MAX_TURN_WORDS);
    });
  });

  it.each(FILES)("%s says the PIN turn, the one long turn, in the exact form", (file) => {
    const events = load(file);
    events.forEach((e, i) => {
      if (!isPinTurn(events, i)) return;
      const result = createTaskOutputSchema.parse((events[i - 1] as { body: unknown }).body);
      expect((e as { text: string }).text).toBe(pinTurn(result.pin, result.board_url));
    });
  });

  it.each(FILES)("%s sends only valid create_task payloads", (file) => {
    for (const args of toolCalls(load(file), "create_task")) {
      expect(() => createTaskInputSchema.parse(args)).not.toThrow();
    }
  });

  it.each(FILES)("%s puts only the seat hold in the description", (file) => {
    for (const args of toolCalls(load(file), "create_task")) {
      expect(createTaskInputSchema.parse(args).description).toMatch(
        /^Save (one|two|three|four) seats?$/,
      );
    }
  });

  it.each(FILES)("%s says the catchphrase and never asks for a yes before create_task", (file) => {
    const events = load(file);
    events.forEach((e, i) => {
      if (e.kind !== "tool_call" || e.name !== "create_task") return;
      createTaskInputSchema.parse(e.args);
      expect(events[i - 1], "the catchphrase before the call").toEqual({
        kind: "agent",
        text: "Sure thing, gotcha covered.",
      });
      const before = events.slice(0, i).flatMap((x) => (x.kind === "agent" ? [x.text] : []));
      for (const text of before) expect(text).not.toMatch(/To confirm|Is that right/);
    });
  });
});

describe("01 normal call", () => {
  const events = load("01-normal-call.md");

  it("sends the sample payload with the caller ID", () => {
    expect(toolCalls(events, "create_task")).toEqual([SAMPLE_NORMAL_CALL]);
    expect(SAMPLE_NORMAL_CALL.caller_phone).toBe(SAMPLE_CALLER_PHONE);
  });

  it("says the PIN from the tool result once, digit by digit, and no board URL", () => {
    const text = agentLines(events).join(" ");
    expect(text.split(spoken(successfulPin(events))).length - 1).toBe(1);
    expect(text).not.toContain("dot fly dot dev");
  });
});

describe("02 no price", () => {
  const events = load("02-no-price.md");

  it("asks for the price before calling create_task, and does not suggest one", () => {
    const ask = events.findIndex(
      (e) => e.kind === "agent" && e.text.includes("What is the most you will pay, in dollars?"),
    );
    const call = events.findIndex((e) => e.kind === "tool_call" && e.name === "create_task");
    expect(ask).toBeGreaterThan(0);
    expect(ask).toBeLessThan(call);
    const callerPrice = events.findIndex((e) => e.kind === "caller" && /8 dollars/.test(e.text));
    for (const line of agentLines(events.slice(0, callerPrice)))
      expect(line, line).not.toMatch(/\d+ dollars/);
  });

  it("sends the sample payload with the price the caller said", () => {
    expect(toolCalls(events, "create_task")).toEqual([SAMPLE_NO_PRICE_CALL]);
  });

  it("says a PIN with a leading zero once, digit by digit", () => {
    const pin = successfulPin(events);
    expect(pin.startsWith("0")).toBe(true);
    expect(agentLines(events).join(" ").split(spoken(pin)).length - 1).toBe(1);
  });

  it("asks task_status for the task it created", () => {
    const created = createTaskOutputSchema.parse(
      (events.find((e) => e.kind === "tool_result" && e.status === 200) as { body: unknown }).body,
    );
    expect(toolCalls(events, "task_status")).toEqual([{ task_id: created.task_id }]);
    const statusResult = events.filter((e) => e.kind === "tool_result").at(-1);
    expect(taskStatusOutputSchema.parse((statusResult as { body: unknown }).body).status).toBe(
      "open",
    );
  });
});

/** The agent turn right after the first caller turn that matches. */
function answerTo(events: TranscriptEvent[], caller: RegExp): string {
  const i = events.findIndex((e) => e.kind === "caller" && caller.test(e.text));
  const next = events[i + 1];
  if (i < 0 || next?.kind !== "agent") throw new Error(`no agent answer to ${caller}`);
  return next.text;
}

describe("03 not a seat", () => {
  const events = load("03-not-a-seat.md");

  it("says the refusal sentence verbatim and never creates a task", () => {
    const lines = agentLines(events);
    expect(lines.filter((l) => l.startsWith(REFUSAL)).length).toBeGreaterThanOrEqual(1);
    expect(toolCalls(events, "create_task")).toEqual([]);
    expect(lines.join(" ")).not.toMatch(/Your PIN/);
  });

  it("refuses food delivery and a spot in a line", () => {
    expect(answerTo(events, /burrito/)).toMatch(new RegExp(`^${REFUSAL}`));
    expect(answerTo(events, /spot in the line/)).toMatch(new RegExp(`^${REFUSAL}`));
  });
});

describe("06 seat and coffee", () => {
  const events = load("06-seat-and-coffee.md");

  it("refuses the coffee and offers only the seat hold", () => {
    expect(answerTo(events, /coffee/)).toBe(`${REFUSAL} Do you want me to save just the seat?`);
  });

  it("keeps the coffee out of the summary and the task", () => {
    expect(toolCalls(events, "create_task")).toEqual([SAMPLE_SEAT_AND_COFFEE_CALL]);
    expect(JSON.stringify(SAMPLE_SEAT_AND_COFFEE_CALL)).not.toMatch(/coffee/i);
    expect(agentLines(events).find((l) => l.startsWith("To confirm:"))).toBeUndefined();
  });

  it("says the PIN from the tool result once", () => {
    expect(
      agentLines(events)
        .join(" ")
        .split(spoken(successfulPin(events))).length - 1,
    ).toBe(1);
  });
});

describe("04 server error", () => {
  const events = load("04-server-error.md");

  it("apologizes, offers a retry, and tries at most two times", () => {
    const calls = toolCalls(events, "create_task");
    expect(calls).toEqual([SAMPLE_SERVER_ERROR_CALL, SAMPLE_SERVER_ERROR_CALL]);
    const lines = agentLines(events);
    expect(lines).toContain(
      "Sorry, something went wrong on our side. Do you want me to try again?",
    );
    expect(lines.at(-1)).toBe("Sorry, it is still not working. Please call back in a few minutes.");
  });

  it("never says a PIN", () => {
    expect(
      events
        .filter((e) => e.kind === "tool_result")
        .every((e) => e.kind === "tool_result" && e.status >= 500),
    ).toBe(true);
    expect(agentLines(events).join(" ")).not.toMatch(/PIN|\b\d, \d, \d, \d\b/);
  });
});

describe("05 right now", () => {
  const events = load("05-right-now.md");

  it("makes the time limit 2 minutes and sends the sample payload", () => {
    expect(toolCalls(events, "create_task")).toEqual([SAMPLE_RIGHT_NOW_CALL]);
    expect(SAMPLE_RIGHT_NOW_CALL.time_limit_minutes).toBe(2);
  });

  it("tells the caller about the new time before creating the task", () => {
    const told = events.findIndex(
      (e) => e.kind === "agent" && e.text === "I will make that 2 minutes. Is that OK?",
    );
    const call = events.findIndex((e) => e.kind === "tool_call" && e.name === "create_task");
    expect(told).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(told);
  });

  it("says the PIN from the tool result once", () => {
    expect(
      agentLines(events)
        .join(" ")
        .split(spoken(successfulPin(events))).length - 1,
    ).toBe(1);
  });
});
