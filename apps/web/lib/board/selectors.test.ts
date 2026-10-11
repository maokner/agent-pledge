import { describe, expect, it } from "vitest";
import { makeSubtask, makeTask, makeTx } from "../fixtures/factories";
import { selectTaskViews } from "./selectors";
import { applyBoardMessage, initialBoardState } from "./state";

describe("selectTaskViews", () => {
  it("lists tasks newest first, each with its sub-tasks and transactions in order", () => {
    const older = makeTask({ id: "tsk_old", created_at: "2026-10-11T18:00:00.000Z", subtask_ids: ["sub_2", "sub_1"] });
    const newer = makeTask({ id: "tsk_new", created_at: "2026-10-11T19:00:00.000Z" });
    const sub1 = makeSubtask({ id: "sub_1", task_id: "tsk_old" });
    const sub2 = makeSubtask({ id: "sub_2", task_id: "tsk_old" });
    const txLate = makeTx({ hash: "LATE", task_id: "tsk_old", submitted_at: "2026-10-11T18:00:09.000Z" });
    const txEarly = makeTx({ hash: "EARLY", task_id: "tsk_old", submitted_at: "2026-10-11T18:00:01.000Z" });
    const txOther = makeTx({ hash: "OTHER", task_id: "tsk_new" });
    const state = applyBoardMessage(initialBoardState, {
      type: "board.snapshot",
      snapshot: {
        seq: 1,
        generated_at: "2026-10-11T19:00:00.000Z",
        tasks: [older, newer],
        subtasks: [sub1, sub2],
        txs: [txLate, txOther, txEarly],
        agent_log: [],
      },
    });

    const views = selectTaskViews(state);

    expect(views.map((v) => v.task.id)).toEqual(["tsk_new", "tsk_old"]);
    expect(views[1]?.subtasks.map((s) => s.id)).toEqual(["sub_2", "sub_1"]);
    expect(views[1]?.txs.map((tx) => tx.hash)).toEqual(["EARLY", "LATE"]);
    expect(views[0]?.txs.map((tx) => tx.hash)).toEqual(["OTHER"]);
  });
});
