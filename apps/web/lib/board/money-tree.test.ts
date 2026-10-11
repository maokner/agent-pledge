import { describe, expect, it } from "vitest";
import { foldEvents } from "../fixtures/board";
import { ScenarioBuilder, seatHoldFlow, type FlowStop } from "../fixtures/scenario";
import { makeSubtask, makeTask, makeTx } from "../fixtures/factories";
import { buildMoneyTree, moneyPlan, summarizeMoney, type MoneyNode } from "./money-tree";
import { selectTaskViews, type TaskView } from "./selectors";

const NOW = Date.parse("2026-10-11T19:00:00.000Z");

/** The PRD's demo task ($5, sub-task $4) run up to `stopAt`. */
function demoView(stopAt: FlowStop): TaskView {
  const b = new ScenarioBuilder({ startSeq: 1, startTime: NOW });
  seatHoldFlow(b, {
    taskId: "tsk_demo",
    subtaskId: "sub_demo",
    claimCode: "7Q2K",
    description: "Save me a seat at the front table",
    place: "Main Stacks, front table",
    timeLimitMinutes: 3,
    price: "5",
    stopAt,
  });
  return selectTaskViews(foldEvents(b.events))[0]!;
}

/** Follows the first child at each level: requester -> vault -> task NFT -> agent -> sub-task NFT -> helper. */
function spine(root: MoneyNode): MoneyNode[] {
  const nodes = [root];
  let node = root;
  while (node.children[0]) {
    node = node.children[0].node;
    nodes.push(node);
  }
  return nodes;
}

function edgesDown(root: MoneyNode) {
  return spine(root)
    .slice(0, -1)
    .map((n) => n.children[0]!.edge);
}

function find(root: MoneyNode, role: MoneyNode["role"]): MoneyNode {
  const found = spine(root).find((n) => n.role === role);
  if (!found) throw new Error(`no ${role} node`);
  return found;
}

describe("buildMoneyTree", () => {
  it("draws the PRD 2.2 tree for a paid task, with every edge green", () => {
    const tree = buildMoneyTree(demoView("paid"));

    expect(spine(tree).map((n) => n.role)).toEqual(["requester", "vault", "task_nft", "agent", "subtask_nft", "helper"]);
    expect(edgesDown(tree).map((e) => e.label)).toEqual([
      "$5.00 in",
      "mints the task NFT",
      "claims, $1.00 pledge",
      "$4.00 funds the sub-task",
      "claims",
    ]);
    expect(edgesDown(tree).every((e) => e.state === "paid")).toBe(true);

    expect(find(tree, "helper").receives.map((e) => [e.label, e.state])).toEqual([["$4.00 to helper", "paid"]]);
    expect(find(tree, "agent").receives.map((e) => [e.label, e.state])).toEqual([["$6.00 to agent", "paid"]]);
    expect(find(tree, "requester").receives).toEqual([]);
    expect(find(tree, "vault").detail).toBe("holds $0.00");
  });

  it("shows refunds back to the requester and the agent in the return color on failure", () => {
    const tree = buildMoneyTree(demoView("failed"));

    expect(find(tree, "requester").receives.map((e) => [e.label, e.state])).toEqual([["$6.00 back", "returned"]]);
    expect(find(tree, "agent").receives.map((e) => [e.label, e.state])).toEqual([["$4.00 back", "returned"]]);
    expect(find(tree, "helper").receives).toEqual([]);
    expect(find(tree, "helper").detail).toBe("nobody claimed");
    expect(find(tree, "vault").detail).toBe("holds $0.00");
  });

  it("keeps money in escrow blue until the task is paid, and shows what is still to come", () => {
    const tree = buildMoneyTree(demoView("posted"));
    const [escrow, mint, claim, funding, helperClaim] = edgesDown(tree);

    expect(escrow?.state).toBe("settled");
    expect(mint?.state).toBe("settled");
    expect(claim?.state).toBe("settled");
    expect(funding?.state).toBe("settled");
    expect(helperClaim?.state).toBe("planned");
    expect(find(tree, "vault").detail).toBe("holds $10.00");
    expect(find(tree, "helper").detail).toBe("not claimed yet");
  });

  it("marks an edge pending while its transaction waits for a validated ledger", () => {
    const tree = buildMoneyTree(demoView("escrowed"));
    const [escrow, mint, claim] = edgesDown(tree);

    expect(escrow?.state).toBe("settled");
    expect(mint?.state).toBe("pending");
    expect(claim?.state).toBe("planned");
    expect(claim?.label).toBe("claims, $1.00 pledge");
    expect(find(tree, "task_nft").nftId).toBeNull();
  });

  it("shows a planned sub-task branch before the agent makes one", () => {
    const tree = buildMoneyTree(demoView("escrowed"));
    const agent = find(tree, "agent");

    expect(agent.children).toHaveLength(1);
    expect(agent.children[0]!.edge.state).toBe("planned");
    expect(agent.children[0]!.edge.label).toBe("funds a sub-task");
    expect(agent.children[0]!.node.detail).toBe("not made yet");
  });

  it("hangs each sub-task under the task NFT named by its parent_nft_id", () => {
    const task = makeTask({ id: "tsk_1", status: "claimed", nft_id: "TASKNFT", subtask_ids: ["sub_a", "sub_b"] });
    const subA = makeSubtask({ id: "sub_a", task_id: "tsk_1", price: "4", nft_id: "NFTA", parent_nft_id: "TASKNFT" });
    const subB = makeSubtask({ id: "sub_b", task_id: "tsk_1", price: "3.5", nft_id: null, parent_nft_id: null });
    const tree = buildMoneyTree({
      task,
      subtasks: [subA, subB],
      txs: [
        makeTx({ hash: "FA", kind: "subtask_escrow", task_id: "tsk_1", subtask_id: "sub_a", amount: "4", status: "validated" }),
        makeTx({ hash: "FB", kind: "subtask_escrow", task_id: "tsk_1", subtask_id: "sub_b", amount: "3.5", status: "pending" }),
      ],
    });
    const branches = find(tree, "agent").children;

    expect(branches.map((c) => [c.edge.label, c.edge.state])).toEqual([
      ["$4.00 funds the sub-task", "settled"],
      ["$3.50 funds the sub-task", "pending"],
    ]);
    expect(branches.map((c) => [c.node.nftId, c.node.parentNftId])).toEqual([
      ["NFTA", "TASKNFT"],
      [null, null],
    ]);
  });

  it("shows a failed transaction as a failed edge", () => {
    const task = makeTask({ id: "tsk_1" });
    const tree = buildMoneyTree({
      task,
      subtasks: [],
      txs: [makeTx({ kind: "task_escrow", task_id: "tsk_1", status: "failed" })],
    });

    expect(tree.children[0]!.edge.state).toBe("failed");
  });
});

describe("moneyPlan", () => {
  it("is the step 8 split: $5.00 in, $4.00 to the helper, $1.00 to the agent", () => {
    expect(moneyPlan(demoView("posted"))).toEqual({ in: "5", toHelper: "4", toAgent: "1" });
  });

  it("uses the newest sub-task's price after a re-post", () => {
    const view = {
      task: makeTask({ price: "4.5", subtask_ids: ["a", "b"] }),
      subtasks: [makeSubtask({ id: "a", price: "3.5" }), makeSubtask({ id: "b", price: "3" })],
      txs: [],
    };
    expect(moneyPlan(view)).toEqual({ in: "4.5", toHelper: "3", toAgent: "1.5" });
  });

  it("has no plan before the agent makes a sub-task", () => {
    expect(moneyPlan(demoView("escrowed"))).toBeNull();
  });
});

describe("summarizeMoney", () => {
  it("matches the PRD 2.2 table after a paid task", () => {
    expect(summarizeMoney(demoView("paid"))).toEqual([
      { party: "requester", paid: "5", got: "0", net: "-5" },
      { party: "agent", paid: "5", got: "6", net: "1" },
      { party: "helper", paid: "0", got: "4", net: "4" },
    ]);
  });

  it("matches the PRD 2.3 table after a failed task: the requester gets the pledge", () => {
    expect(summarizeMoney(demoView("failed"))).toEqual([
      { party: "requester", paid: "5", got: "6", net: "1" },
      { party: "agent", paid: "5", got: "4", net: "-1" },
      { party: "helper", paid: "0", got: "0", net: "0" },
    ]);
  });

  it("counts only validated payments, with exact cents", () => {
    const task = makeTask({ id: "tsk_1", price: "4.5" });
    const summary = summarizeMoney({
      task,
      subtasks: [],
      txs: [
        makeTx({ hash: "A", kind: "task_escrow", task_id: "tsk_1", amount: "4.5", status: "validated" }),
        makeTx({ hash: "B", kind: "task_claim", task_id: "tsk_1", amount: "1", status: "pending" }),
        makeTx({ hash: "C", kind: "subtask_escrow", task_id: "tsk_1", amount: "3.5", status: "failed" }),
      ],
    });

    expect(summary).toEqual([
      { party: "requester", paid: "4.5", got: "0", net: "-4.5" },
      { party: "agent", paid: "0", got: "0", net: "0" },
      { party: "helper", paid: "0", got: "0", net: "0" },
    ]);
  });
});
