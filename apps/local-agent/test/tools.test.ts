import { describe, expect, it, vi } from "vitest";
import type { AgentLedger } from "@agent-pledge/shared";
import type { ServerApi } from "../src/api";
import { buildToolDefinitions, SYSTEM_PROMPT, TOOL_NAMES } from "../src/llm";
import { scriptedPostText } from "../src/scripted";
import { AgentTools, ToolInputError, validateSubtaskPrice } from "../src/tools";
import type { YikYakPoster } from "../src/yikyak/poster";
import { makeTask } from "./mock-server";

function stubApi() {
  return {
    log: vi.fn(async () => ({})),
    claimTask: vi.fn(async (id: string) => ({ task: { ...makeTask({ id }), status: "claimed" } })),
    createSubtask: vi.fn(async (id: string, body: { price: string }) => ({
      subtask: {
        id: "sub_0000000000000001",
        task_id: id,
        price: body.price,
        deadline: "2026-10-11T18:03:00.000Z",
      },
      claim_url: "http://board.test/c/7Q2K",
      claim_code: "7Q2K",
    })),
    redeemTask: vi.fn(async () => ({
      amount: "6.00",
      payout_tx_hash: "H",
      explorer_url: "https://x/H",
    })),
  };
}

function setup(ledger: AgentLedger | null = null) {
  const api = stubApi();
  const poster = {
    submit: vi.fn(async () => ({ status: "posted", screenshot_path: "/tmp/x.png" })),
  };
  const tools = new AgentTools({
    api: api as unknown as ServerApi,
    ledger,
    poster: poster as unknown as YikYakPoster,
  });
  type Handler = (args: Record<string, string>, extra: unknown) => Promise<ToolRes>;
  const defs = Object.fromEntries(
    buildToolDefinitions(tools).map((d) => [d.name, { handler: d.handler as unknown as Handler }]),
  );
  const task = makeTask({ id: "task_aaaaaaaaaaaaaaaa", price: "5.00" });
  tools.track(task);
  return { api, poster, tools, defs, task };
}

type ToolRes = { content: Array<{ type: string; text?: string }>; isError?: boolean };
const text = (r: ToolRes) => r.content.map((c) => c.text ?? "").join("");

describe("validateSubtaskPrice", () => {
  it("accepts amounts in (0, task price] and normalizes them", () => {
    expect(validateSubtaskPrice("4.00", "5.00")).toBe("4.00");
    expect(validateSubtaskPrice("4", "5.00")).toBe("4.00");
    expect(validateSubtaskPrice("$4.5", "5.00")).toBe("4.50");
    expect(validateSubtaskPrice(5, "5.00")).toBe("5.00");
  });
  it("rejects zero, negative, too high, and garbage", () => {
    for (const bad of ["0", "0.00", "-1", "5.01", "abc", "", "4.005"]) {
      expect(() => validateSubtaskPrice(bad, "5.00")).toThrow(ToolInputError);
    }
  });
});

describe("LLM tool layer (handlers called directly, no model)", () => {
  it("exposes exactly the PRD 7.2 tools and the price policy is in the prompt", () => {
    const { defs } = setup();
    expect(Object.keys(defs).sort()).toEqual([...TOOL_NAMES].sort());
    expect(SYSTEM_PROMPT).toContain("80% of the task price, rounded DOWN to the nearest 0.50");
  });

  it("create_subtask rejects bad prices with a tool error and accepts a valid one", async () => {
    const { defs, api, task } = setup();
    await defs.claim_task!.handler({ task_id: task.id }, {});
    for (const price of ["6.00", "0", "free"]) {
      const res = await defs.create_subtask!.handler({ task_id: task.id, price, reason: "r" }, {});
      expect(res.isError).toBe(true);
      expect(text(res)).toMatch(/^Error: /);
    }
    expect(api.createSubtask).not.toHaveBeenCalled();

    const ok = await defs.create_subtask!.handler(
      { task_id: task.id, price: "4.00", reason: "80% of 5.00" },
      {},
    );
    expect(ok.isError).toBeUndefined();
    expect(JSON.parse(text(ok))).toMatchObject({
      subtask_id: "sub_0000000000000001",
      claim_url: "http://board.test/c/7Q2K",
    });
    expect(api.createSubtask).toHaveBeenCalledWith(task.id, { price: "4.00" });
    expect(api.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "decision",
        message: "Sub-task price: 4.00 (80% of 5.00). 80% of 5.00",
      }),
    );
  });

  it("create_subtask requires a claim first; post_yikyak requires the claim link", async () => {
    const { defs, poster, task } = setup();
    const early = await defs.create_subtask!.handler(
      { task_id: task.id, price: "4.00", reason: "" },
      {},
    );
    expect(text(early)).toContain("claim the task first");
    await defs.claim_task!.handler({ task_id: task.id }, {});
    await defs.create_subtask!.handler({ task_id: task.id, price: "4.00", reason: "" }, {});
    const noLink = await defs.post_yikyak!.handler(
      { subtask_id: "sub_0000000000000001", text: "$4 for a seat" },
      {},
    );
    expect(noLink.isError).toBe(true);
    expect(text(noLink)).toContain("http://board.test/c/7Q2K");
    const post = "$4 to save a seat at Main Stacks in 3 min: http://board.test/c/7Q2K";
    const ok = await defs.post_yikyak!.handler(
      { subtask_id: "sub_0000000000000001", text: post },
      {},
    );
    expect(ok.isError).toBeUndefined();
    expect(poster.submit).toHaveBeenCalledWith(
      expect.objectContaining({ text: post, subtask_id: "sub_0000000000000001" }),
    );
  });

  it("redeem_task refuses before the task is redeemable", async () => {
    const { defs, task } = setup();
    const res = await defs.redeem_task!.handler({ task_id: task.id }, {});
    expect(text(res)).toContain("not redeemable yet");
  });

  it("in xrpl mode signs on the laptop and sends the hashes", async () => {
    const ledger = {
      address: "rAgent",
      acceptOffer: vi.fn(async () => ({ hash: "CLAIMHASH" })),
      fundSubtask: vi.fn(async () => ({ hash: "FUNDHASH" })),
      createRedeemOffer: vi.fn(async () => ({ hash: "OFFERHASH", offerId: "OFFERID" })),
    } as unknown as AgentLedger;
    const { tools, api, task } = setup(ledger);
    await tools.claimTask({ task_id: task.id });
    expect(api.claimTask).toHaveBeenCalledWith(task.id, { tx_hash: "CLAIMHASH" });
    await tools.createSubtask({ task_id: task.id, price: "4.00" });
    const body = api.createSubtask.mock.calls[0]![1] as Record<string, string>;
    expect(body).toMatchObject({ price: "4.00", funding_tx_hash: "FUNDHASH" });
    expect(body.subtask_id).toMatch(/^sub_[0-9a-z]{16}$/);
    expect(ledger.fundSubtask).toHaveBeenCalledWith(body.subtask_id, "4.00", expect.anything());
    tools.markRedeemable({
      type: "task.redeemable",
      task_id: task.id,
      subtask_id: "s",
      nft_id: "NFT1",
      amount: "6.00",
      vault_address: "rV",
    });
    await tools.redeemTask({ task_id: task.id });
    expect(ledger.createRedeemOffer).toHaveBeenCalledWith("NFT1", "6.00", { taskId: task.id });
    expect(api.redeemTask).toHaveBeenCalledWith(task.id, {
      offer_id: "OFFERID",
      tx_hash: "OFFERHASH",
    });
  });
});

describe("scripted post text", () => {
  it("is built from the task data and the claim link", () => {
    expect(
      scriptedPostText(
        {
          description: "Save me a seat at the front table",
          place: "Main Stacks",
          time_limit_minutes: 3,
        },
        { price: "4.00", claim_url: "http://board.test/c/7Q2K" },
      ),
    ).toBe(
      "$4 to save a seat at the front table at Main Stacks in the next 3 min. First to claim gets it: http://board.test/c/7Q2K",
    );
  });
});
