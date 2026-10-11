import { describe, expect, it } from "vitest";
import { makeSubtask, makeTask, makeTx } from "../fixtures/factories";
import { compactTxs, selectPartyNames, selectTaskViews, splitTxs, subtaskHolder, taskHolder } from "./selectors";
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

describe("taskHolder", () => {
  it("names who holds the task NFT in each status", () => {
    expect(taskHolder(makeTask({ status: "open", nft_id: null }))).toBe("Vault (minting the NFT)");
    expect(taskHolder(makeTask({ status: "open", nft_id: "NFT" }))).toBe("Vault");
    expect(taskHolder(makeTask({ status: "claimed" }))).toBe("Local agent");
    expect(taskHolder(makeTask({ status: "done" }))).toBe("Nobody: paid out, NFT burned");
    expect(taskHolder(makeTask({ status: "failed" }))).toBe("Nobody: refunded, NFT burned");
  });
});

describe("subtaskHolder", () => {
  it("is open until a helper claims it", () => {
    expect(subtaskHolder(makeSubtask({ status: "open" }))).toBe("Open to anyone");
    expect(subtaskHolder(makeSubtask({ status: "claimed", helper_address: "rHelper" }))).toBe("A helper");
    expect(subtaskHolder(makeSubtask({ status: "done", helper_address: "rHelper" }))).toBe("A helper (paid)");
    expect(subtaskHolder(makeSubtask({ status: "failed", helper_address: null }))).toBe("Nobody claimed it");
    expect(subtaskHolder(makeSubtask({ status: "failed", helper_address: "rHelper" }))).toBe("A helper (not paid)");
  });
});

describe("selectPartyNames", () => {
  it("names the requester, vault, local agent and helpers by address", () => {
    const view = {
      task: makeTask({ requester_address: "rReq", agent_address: "rAgent" }),
      subtasks: [makeSubtask({ helper_address: "rHelp" }), makeSubtask({ id: "sub_2", helper_address: null })],
      txs: [makeTx({ kind: "task_escrow", from: "rReq", to: "rVault" })],
    };

    expect(Object.fromEntries(selectPartyNames(view))).toEqual({
      rReq: "Requester",
      rAgent: "Local agent",
      rHelp: "Helper",
      rVault: "Vault",
    });
  });

  it("finds the vault from a mint when the escrow payment has not arrived", () => {
    const view = {
      task: makeTask({ requester_address: "rReq" }),
      subtasks: [],
      txs: [makeTx({ kind: "task_nft_mint", tx_type: "NFTokenMint", from: "rVault", to: null, amount: null })],
    };

    expect(selectPartyNames(view).get("rVault")).toBe("Vault");
  });
});

describe("compactTxs", () => {
  const tx = (hash: string, status: "pending" | "validated" = "validated") => makeTx({ hash, status });

  it("keeps the newest rows", () => {
    const txs = [tx("A"), tx("B"), tx("C"), tx("D"), tx("E")];
    expect(compactTxs(txs, 3).map((t) => t.hash)).toEqual(["C", "D", "E"]);
  });

  it("never hides a pending transaction, and keeps the original order", () => {
    const txs = [tx("A"), tx("B", "pending"), tx("C"), tx("D"), tx("E")];
    expect(compactTxs(txs, 2).map((t) => t.hash)).toEqual(["B", "D", "E"]);
  });

  it("returns everything when there are few rows", () => {
    const txs = [tx("A"), tx("B")];
    expect(compactTxs(txs, 3)).toEqual(txs);
  });
});

describe("splitTxs", () => {
  it("separates the task's own transactions from each sub-task's", () => {
    const view = {
      task: makeTask({ id: "tsk_1" }),
      subtasks: [makeSubtask({ id: "sub_a" }), makeSubtask({ id: "sub_b" })],
      txs: [
        makeTx({ hash: "T1", subtask_id: null }),
        makeTx({ hash: "A1", subtask_id: "sub_a" }),
        makeTx({ hash: "T2", subtask_id: null }),
      ],
    };

    const split = splitTxs(view);

    expect(split.task.map((tx) => tx.hash)).toEqual(["T1", "T2"]);
    expect(split.bySubtask.get("sub_a")?.map((tx) => tx.hash)).toEqual(["A1"]);
    expect(split.bySubtask.get("sub_b")).toEqual([]);
  });
});
