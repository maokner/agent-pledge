import { describe, expect, it } from "vitest";
import { buildFixtureHistory, buildFixtureSnapshot, buildLiveRun } from "./board";

const NOW = Date.parse("2026-10-11T19:00:00.000Z");

describe("fixture board data", () => {
  it("numbers history events 1, 2, 3, ... with no gaps", () => {
    const seqs = buildFixtureHistory(NOW).map((e) => e.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });

  it("has a task and a sub-task in every status", () => {
    const snap = buildFixtureSnapshot(NOW);
    expect(new Set(snap.tasks.map((t) => t.status))).toEqual(new Set(["open", "claimed", "done", "failed"]));
    expect(new Set(snap.subtasks.map((s) => s.status))).toEqual(new Set(["open", "claimed", "done", "failed"]));
  });

  it("has pending and validated transactions, a photo, a screenshot and agent log lines", () => {
    const snap = buildFixtureSnapshot(NOW);
    expect(new Set(snap.txs.map((tx) => tx.status))).toEqual(new Set(["pending", "validated"]));
    expect(snap.subtasks.some((s) => s.photo)).toBe(true);
    expect(snap.subtasks.some((s) => s.yikyak_post?.screenshot_url)).toBe(true);
    expect(snap.agent_log.length).toBeGreaterThan(0);
  });

  it("live runs continue the sequence from where they start", () => {
    const run = buildLiveRun({ run: 0, startSeq: 101, startTime: NOW, stepMs: 1000 });
    expect(run[0]?.seq).toBe(101);
    expect(run.at(-1)?.seq).toBe(100 + run.length);
    expect(run.at(-1)?.type).toBe("agent.log");
    expect(buildLiveRun({ run: 1, startSeq: 1, startTime: NOW, stepMs: 1000 }).some((e) => e.type === "task.failed")).toBe(true);
  });
});
