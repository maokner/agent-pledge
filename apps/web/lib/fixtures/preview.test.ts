import { describe, expect, it } from "vitest";
import { buildPreviewState } from "./preview";

const NOW = Date.parse("2026-10-11T19:00:00.000Z");

describe("buildPreviewState", () => {
  it("has exactly one task with one sub-task for the 'one' layout", () => {
    const state = buildPreviewState("one", NOW);
    expect(Object.keys(state.tasks)).toHaveLength(1);
    expect(Object.keys(state.subtasks)).toHaveLength(1);
  });

  it("has three tasks: done, failed and in progress", () => {
    const state = buildPreviewState("three", NOW);
    expect(Object.values(state.tasks).map((t) => t.status).sort()).toEqual(["claimed", "done", "failed"]);
  });

  it("covers every work status for tasks and sub-tasks", () => {
    const state = buildPreviewState("stops", NOW);
    const all = ["claimed", "done", "failed", "open"];
    expect([...new Set(Object.values(state.tasks).map((t) => t.status))].sort()).toEqual(all);
    expect([...new Set(Object.values(state.subtasks).map((s) => s.status))].sort()).toEqual(all);
  });
});
