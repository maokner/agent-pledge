import { describe, expect, it } from "vitest";
import { makeTask } from "../fixtures/factories";
import { projectorFocus, projectorModeFrom } from "./projector";
import type { TaskView } from "./selectors";

describe("projectorModeFrom", () => {
  it("is off with no query and nothing remembered", () => {
    expect(projectorModeFrom("", null)).toEqual({ on: false, remember: null });
  });

  it("turns on from ?projector=1 and remembers it", () => {
    expect(projectorModeFrom("?projector=1", null)).toEqual({ on: true, remember: "1" });
    expect(projectorModeFrom("?layout=one&projector=1", "0")).toEqual({ on: true, remember: "1" });
  });

  it("keeps the remembered choice when the URL has no projector query", () => {
    expect(projectorModeFrom("?layout=one", "1")).toEqual({ on: true, remember: null });
    expect(projectorModeFrom("", "0")).toEqual({ on: false, remember: null });
  });

  it("turns off from ?projector=0 and remembers that", () => {
    expect(projectorModeFrom("?projector=0", "1")).toEqual({ on: false, remember: "0" });
  });

  it("accepts on/off and true/false, and ignores a value it does not know", () => {
    expect(projectorModeFrom("?projector=on", null).on).toBe(true);
    expect(projectorModeFrom("?projector=true", null).on).toBe(true);
    expect(projectorModeFrom("?projector", null).on).toBe(true);
    expect(projectorModeFrom("?projector=off", "1")).toEqual({ on: false, remember: "0" });
    expect(projectorModeFrom("?projector=false", "1").on).toBe(false);
    expect(projectorModeFrom("?projector=maybe", "1")).toEqual({ on: true, remember: null });
  });
});

function view(id: string): TaskView {
  return { task: makeTask({ id }), subtasks: [], txs: [] };
}
const ids = (views: TaskView[]) => views.map((v) => v.task.id);

describe("projectorFocus", () => {
  it("gives the big card to the newest task and lists the rest in board order", () => {
    const { focus, others } = projectorFocus([view("tsk_c"), view("tsk_b"), view("tsk_a")], null);
    expect(focus?.task.id).toBe("tsk_c");
    expect(ids(others)).toEqual(["tsk_b", "tsk_a"]);
  });

  it("gives the big card to the task the operator picked, and keeps the rest in board order", () => {
    const { focus, others } = projectorFocus([view("tsk_c"), view("tsk_b"), view("tsk_a")], "tsk_b");
    expect(focus?.task.id).toBe("tsk_b");
    expect(ids(others)).toEqual(["tsk_c", "tsk_a"]);
  });

  it("falls back to the newest task when the picked task is gone, and has nothing on an empty board", () => {
    expect(projectorFocus([view("tsk_b"), view("tsk_a")], "tsk_gone").focus?.task.id).toBe("tsk_b");
    expect(projectorFocus([], "tsk_gone")).toEqual({ focus: null, others: [] });
  });

  it("puts tasks that are still running ahead of finished ones in the small cards", () => {
    const views = [
      view("tsk_e"),
      { ...view("tsk_d"), task: makeTask({ id: "tsk_d", status: "done" }) },
      { ...view("tsk_c"), task: makeTask({ id: "tsk_c", status: "claimed" }) },
      { ...view("tsk_b"), task: makeTask({ id: "tsk_b", status: "failed" }) },
      { ...view("tsk_a"), task: makeTask({ id: "tsk_a", status: "open" }) },
    ];
    expect(ids(projectorFocus(views, null).others)).toEqual(["tsk_c", "tsk_a", "tsk_d", "tsk_b"]);
  });
});
