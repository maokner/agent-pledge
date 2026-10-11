import { describe, expect, it } from "vitest";
import { buildFixtureHistory, foldEvents } from "../fixtures/board";
import { makeLogLine, makeTask } from "../fixtures/factories";
import { countNewerThan, isAtBottom, selectAgentLog, taskTag } from "./agent-log";
import { applyBoardMessage, initialBoardState } from "./state";

describe("taskTag", () => {
  it("is the last 4 characters of the ID, upper case, for the draft's and the real server's prefixes", () => {
    expect(taskTag("tsk_01JA7Q2K")).toBe("7Q2K");
    expect(taskTag("task_k3j9x0c2m1q8z7w4")).toBe("Z7W4");
    expect(taskTag("task_ab")).toBe("AB");
  });
});

describe("selectAgentLog", () => {
  it("lists lines oldest first, each with a short tag and the description of its task", () => {
    const state = applyBoardMessage(initialBoardState, {
      type: "board.snapshot",
      snapshot: {
        seq: 2,
        generated_at: "2026-10-11T19:00:00.000Z",
        tasks: [makeTask({ id: "tsk_01JA7Q2K", description: "Save me a seat at the front table" })],
        subtasks: [],
        txs: [],
        agent_log: [
          makeLogLine({ id: "a", task_id: "tsk_01JA7Q2K", message: "Claimed task, pledge $1.00" }),
          makeLogLine({ id: "b", task_id: null, message: "Agent started" }),
        ],
      },
    });

    expect(selectAgentLog(state)).toEqual([
      expect.objectContaining({ id: "a", task: { tag: "7Q2K", description: "Save me a seat at the front table" } }),
      expect.objectContaining({ id: "b", task: null }),
    ]);
  });

  it("keeps the order the events came in, without duplicates after a replay", () => {
    const history = buildFixtureHistory(Date.parse("2026-10-11T19:00:00.000Z"));
    const logEvents = history.filter((e) => e.type === "agent.log");
    const replayed = [...history, ...history.slice(-10)];

    const entries = selectAgentLog(foldEvents(replayed));

    expect(entries.map((e) => e.id)).toEqual(logEvents.map((e) => e.data.line.id));
    expect(entries.map((e) => e.message)).toContain("Sub-task price: $4.00 (80% of $5.00)");
  });
});

describe("agent log auto-scroll", () => {
  it("follows new lines only while the panel is scrolled to the bottom", () => {
    expect(isAtBottom({ scrollTop: 600, clientHeight: 400, scrollHeight: 1000 })).toBe(true);
    expect(isAtBottom({ scrollTop: 590, clientHeight: 400, scrollHeight: 1000 })).toBe(true); // a few px off
    expect(isAtBottom({ scrollTop: 300, clientHeight: 400, scrollHeight: 1000 })).toBe(false);
    expect(isAtBottom({ scrollTop: 0, clientHeight: 400, scrollHeight: 300 })).toBe(true); // no scrollbar
  });

  it("counts the lines that arrived after the last one the reader saw", () => {
    const lines = ["a", "b", "c", "d"].map((id) => ({ id }));

    expect(countNewerThan(lines, "b")).toBe(2);
    expect(countNewerThan(lines, "d")).toBe(0);
    expect(countNewerThan(lines, "gone")).toBe(4); // the seen line fell off the end of the log
    expect(countNewerThan(lines, null)).toBe(0);
  });
});
