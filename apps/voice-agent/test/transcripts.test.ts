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
  SAMPLE_SERVER_ERROR_CALL,
} from "../src/samples.js";
import { packagePath } from "../src/paths.js";
import { parseTranscript, type TranscriptEvent } from "./transcript-parser.js";

const REFUSAL = "Right now I can only save seats.";
const { firstMessage } = loadAssets();

const load = (file: string) => parseTranscript(readText("transcripts", file));
const agentLines = (events: TranscriptEvent[]) =>
  events.flatMap((e) => (e.kind === "agent" ? [e.text] : []));
const toolCalls = (events: TranscriptEvent[], name: string) =>
  events.flatMap((e) => (e.kind === "tool_call" && e.name === name ? [e.args] : []));

function lastIndex<T>(items: T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i] as T)) return i;
  return -1;
}

/** "4821" becomes "4, 8, 2, 1". */
const spoken = (pin: string) => pin.split("").join(", ");

function successfulPin(events: TranscriptEvent[]): string {
  const result = events.find((e) => e.kind === "tool_result" && e.status === 200);
  if (result?.kind !== "tool_result") throw new Error("no successful tool result");
  return createTaskOutputSchema.parse(result.body).pin;
}

const FILES = [
  "01-normal-call.md",
  "02-no-price.md",
  "03-not-a-seat.md",
  "04-server-error.md",
  "05-right-now.md",
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

  it.each(FILES)("%s keeps agent turns short for speakerphone", (file) => {
    for (const line of agentLines(load(file))) {
      expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(45);
    }
  });

  it.each(FILES)("%s sends only valid create_task payloads", (file) => {
    for (const args of toolCalls(load(file), "create_task")) {
      expect(() => createTaskInputSchema.parse(args)).not.toThrow();
    }
  });

  it.each(FILES)("%s confirms before every create_task call", (file) => {
    const events = load(file);
    events.forEach((e, i) => {
      if (e.kind !== "tool_call" || e.name !== "create_task") return;
      const before = events.slice(0, i);
      const confirm = lastIndex(
        before,
        (x) => x.kind === "agent" && x.text.startsWith("To confirm:"),
      );
      const yes = lastIndex(before, (x) => x.kind === "caller" && /^yes\b/i.test(x.text));
      expect(confirm, "a 'To confirm:' turn").toBeGreaterThanOrEqual(0);
      expect(yes, "a yes after the confirmation").toBeGreaterThan(confirm);
    });
  });
});

describe("01 normal call", () => {
  const events = load("01-normal-call.md");

  it("sends the sample payload with the caller ID", () => {
    expect(toolCalls(events, "create_task")).toEqual([SAMPLE_NORMAL_CALL]);
    expect(SAMPLE_NORMAL_CALL.caller_phone).toBe(SAMPLE_CALLER_PHONE);
  });

  it("says the PIN from the tool result two times, digit by digit", () => {
    const text = agentLines(events).join(" ");
    expect(text.split(spoken(successfulPin(events))).length - 1).toBe(2);
  });

  it("says the board URL", () => {
    expect(agentLines(events).join(" ")).toContain("agent dash pledge dot fly dot dev slash board");
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

  it("says a PIN with a leading zero two times", () => {
    const pin = successfulPin(events);
    expect(pin.startsWith("0")).toBe(true);
    expect(agentLines(events).join(" ").split(spoken(pin)).length - 1).toBe(2);
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

describe("03 not a seat", () => {
  const events = load("03-not-a-seat.md");

  it("says the refusal sentence verbatim and never creates a task", () => {
    const lines = agentLines(events);
    expect(lines.filter((l) => l.startsWith(REFUSAL)).length).toBeGreaterThanOrEqual(1);
    expect(toolCalls(events, "create_task")).toEqual([]);
    expect(lines.join(" ")).not.toMatch(/Your PIN/);
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

  it("tells the caller about the new time before the summary", () => {
    const told = events.findIndex(
      (e) => e.kind === "agent" && e.text === "I will make that 2 minutes. Is that OK?",
    );
    const summary = events.findIndex((e) => e.kind === "agent" && e.text.startsWith("To confirm:"));
    expect(told).toBeGreaterThan(0);
    expect(summary).toBeGreaterThan(told);
    expect((events[summary] as { text: string }).text).toContain("within 2 minutes");
  });

  it("says the PIN from the tool result two times", () => {
    expect(
      agentLines(events)
        .join(" ")
        .split(spoken(successfulPin(events))).length - 1,
    ).toBe(2);
  });
});
