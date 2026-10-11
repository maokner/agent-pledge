import type { AddressInfo } from "node:net";
import type {
  BoardEvent,
  BoardServerMessage,
  BoardState,
  CreateTaskResponse,
  TaskView,
} from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startFakeAgent } from "../scripts/fake-agent";
import { subtasks, tasks } from "../src/db/schema";
import { tasksIdle } from "../src/services/tasks";
import {
  agentHeaders,
  buildTestApp,
  insertTask,
  TEST_AGENT_TOKEN,
  type TestApp,
  voiceHeaders,
} from "./helpers";

const PRD_EXAMPLE = {
  description: "Save me a seat at the front table",
  place: "Main Stacks",
  time_limit_minutes: 3,
  price_usd: 5,
  caller_phone: "+15105550123",
};

async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs = 3000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function createTask(t: TestApp, body: Record<string, unknown> = PRD_EXAMPLE) {
  const res = await t.app.inject({
    method: "POST",
    url: "/tools/create_task",
    headers: voiceHeaders,
    payload: body,
  });
  return res;
}

async function boardState(t: TestApp): Promise<BoardState> {
  return (await t.app.inject({ method: "GET", url: "/board/state" })).json();
}

/** A WebSocket client that records every message. */
function client(url: string, headers?: Record<string, string>) {
  const ws = new WebSocket(url, headers ? { headers } : undefined);
  const messages: Array<Record<string, unknown>> = [];
  ws.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  const opened = new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const close = () =>
    new Promise<void>((r) => {
      if (ws.readyState === WebSocket.CLOSED) return r();
      ws.once("close", () => r());
      ws.close();
    });
  return { ws, messages, opened, close };
}

describe("create_task and task_status (#19)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await buildTestApp({ latencyMs: 20 });
  });
  afterAll(() => t.close());

  it("returns fast with a PIN, then the task's txs go pending -> validated on the board", async () => {
    const started = Date.now();
    const res = await createTask(t);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.statusCode).toBe(200);
    const body = res.json<CreateTaskResponse>();
    expect(body.pin).toMatch(/^\d{4}$/);
    expect(body.board_url).toBe(`http://board.test/?task=${body.task_id}`);
    expect(body).toMatchObject({ status: "open", price: "5.00" });

    // Visible on the board at once.
    const first = await boardState(t);
    expect(first.tasks.find((x) => x.id === body.task_id)).toBeTruthy();

    // Pending transactions appear while the ledger works.
    const pending = await waitFor(async () => {
      const s = await boardState(t);
      const task = s.tasks.find((x) => x.id === body.task_id)!;
      return task.transactions.some((x) => x.status === "pending") ? task : null;
    });
    expect(pending.transactions.length).toBeGreaterThan(0);

    await tasksIdle(t.app);
    const done = (await boardState(t)).tasks.find((x) => x.id === body.task_id)!;
    const kinds = done.transactions.map((x) => x.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["requester_funding", "task_funding", "task_nft_mint", "task_offer"]),
    );
    expect(done.transactions.every((x) => x.status === "validated")).toBe(true);
    expect(done.nft_id).toBeTruthy();
    expect(done.offer_id).toBeTruthy();
    expect(done.requester_address).toBeTruthy();
    expect(t.fake.balanceOf(t.fake.vaultAddress)).toBe("5.00");

    const types = t.bus.recent().map((e) => e.type);
    expect(types).toContain("task.created");
    expect(types).toContain("tx.pending");
    expect(types).toContain("tx.validated");

    const status = await t.app.inject({
      method: "GET",
      url: `/tools/task_status/${body.task_id}`,
      headers: voiceHeaders,
    });
    expect(status.json()).toMatchObject({
      task_id: body.task_id,
      status: "open",
      helper_note: null,
    });
  });

  it("normalizes string prices and rejects bad input", async () => {
    const ok = await createTask(t, { ...PRD_EXAMPLE, price_usd: "$7.5" });
    expect(ok.json().price).toBe("7.50");
    const notSeat = await createTask(t, { ...PRD_EXAMPLE, description: "Pick up my laundry" });
    expect(notSeat.statusCode).toBe(422);
    expect(notSeat.json().error).toBe("not_seat_hold");
    expect((await createTask(t, { ...PRD_EXAMPLE, price_usd: "abc" })).statusCode).toBe(400);
    expect((await createTask(t, { ...PRD_EXAMPLE, price_usd: 0 })).statusCode).toBe(400);
    expect((await createTask(t, { place: "x" })).statusCode).toBe(400);
    const unauth = await t.app.inject({
      method: "POST",
      url: "/tools/create_task",
      payload: PRD_EXAMPLE,
    });
    expect(unauth.statusCode).toBe(401);
    const missing = await t.app.inject({
      method: "GET",
      url: "/tools/task_status/task_nope",
      headers: voiceHeaders,
    });
    expect(missing.statusCode).toBe(404);
    await tasksIdle(t.app);
  });

  it("marks the task failed when a ledger step fails", async () => {
    const orig = t.fake.mintTaskNft.bind(t.fake);
    t.fake.mintTaskNft = async () => {
      throw new Error("boom");
    };
    try {
      const res = await createTask(t);
      await tasksIdle(t.app);
      const task = (await boardState(t)).tasks.find((x) => x.id === res.json().task_id)!;
      expect(task.status).toBe("failed");
      expect(task.fail_reason).toContain("boom");
      expect(t.bus.recent().some((e) => e.type === "task.failed")).toBe(true);
    } finally {
      t.fake.mintTaskNft = orig;
    }
  });
});

describe("local agent API (#20)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  const post = (url: string, payload: unknown = {}) =>
    t.app.inject({ method: "POST", url, headers: agentHeaders, payload: payload as object });

  it("claims with an agent tx hash, creates a sub-task with a funding hash, and serves NFT data", async () => {
    const { task } = await insertTask(t.app, { status: "open" });
    const claimTx = await t.fake.agent.acceptOffer(task.offerId!, { taskId: task.id });
    const claim = await post(`/agent/tasks/${task.id}/claim`, { tx_hash: claimTx.hash });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().task.status).toBe("claimed");
    expect((await post(`/agent/tasks/${task.id}/claim`)).statusCode).toBe(409);

    expect((await post(`/agent/tasks/${task.id}/subtasks`, { price: "0.00" })).statusCode).toBe(
      400,
    );
    expect((await post(`/agent/tasks/${task.id}/subtasks`, { price: "5.01" })).statusCode).toBe(
      400,
    );

    // Funding with the wrong amount is rejected by verifyTx.
    const wrongId = "sub_0000000000000001";
    const wrong = await t.fake.agent.fundSubtask(wrongId, "3.00", { taskId: task.id });
    const bad = await post(`/agent/tasks/${task.id}/subtasks`, {
      price: "4.00",
      subtask_id: wrongId,
      funding_tx_hash: wrong.hash,
    });
    expect(bad.statusCode).toBe(502);

    const subId = "sub_0000000000000002";
    const fund = await t.fake.agent.fundSubtask(subId, "4.00", { taskId: task.id });
    const sub = await post(`/agent/tasks/${task.id}/subtasks`, {
      price: "4.00",
      subtask_id: subId,
      funding_tx_hash: fund.hash,
    });
    expect(sub.statusCode).toBe(200);
    const body = sub.json();
    expect(body.claim_url).toBe(`http://board.test/c/${body.claim_code}`);
    expect(body.subtask).toMatchObject({ id: subId, price: "4.00", status: "open" });
    expect(body.subtask.deadline).toBe(task.deadline.toISOString());
    expect(body.subtask.nft_id).toBeTruthy();
    expect(body.subtask.offer_id).toBeTruthy();
    // Retry with the same subtask_id is idempotent.
    const again = await post(`/agent/tasks/${task.id}/subtasks`, {
      price: "4.00",
      subtask_id: subId,
      funding_tx_hash: fund.hash,
    });
    expect(again.json().subtask.id).toBe(subId);
    expect(t.bus.recent().some((e) => e.type === "subtask.created")).toBe(true);

    const nft = (await t.app.inject({ method: "GET", url: `/tasks/${subId}.json` })).json();
    expect(nft).toMatchObject({
      id: subId,
      kind: "subtask",
      price: "4.00",
      parent_task_id: task.id,
      parent_nft_id: task.nftId,
    });
    const tj = (await t.app.inject({ method: "GET", url: `/tasks/${task.id}.json` })).json();
    expect(tj).toMatchObject({ kind: "task", nft_id: task.nftId, parent_nft_id: null });
    expect((await t.app.inject({ method: "GET", url: "/tasks/task_nope.json" })).statusCode).toBe(
      404,
    );

    const view = await t.app.inject({
      method: "GET",
      url: `/agent/tasks/${task.id}`,
      headers: agentHeaders,
    });
    expect(view.json<TaskView>().subtasks).toHaveLength(1);
  });

  it("redeems only after the sub-task is paid, idempotently", async () => {
    const f = await insertTask(t.app, { status: "claimed", subtask: "claimed" });
    expect((await post(`/agent/tasks/${f.task.id}/redeem`)).statusCode).toBe(409);
    await t.db
      .update(subtasks)
      .set({ paidAt: new Date(), status: "done" })
      .where(eq(subtasks.id, f.subtasks[0]!.subtask.id));
    const r1 = await post(`/agent/tasks/${f.task.id}/redeem`);
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ amount: "6.00", task: { status: "done" } });
    const r2 = await post(`/agent/tasks/${f.task.id}/redeem`);
    expect(r2.json().payout_tx_hash).toBe(r1.json().payout_tx_hash);
    expect(t.bus.recent().filter((e) => e.type === "task.paid")).toHaveLength(1);
  });

  it("appends to the agent log and broadcasts agent.log", async () => {
    const res = await post("/agent/log", { message: "Thinking about prices", level: "decision" });
    expect(res.json().entry).toMatchObject({ message: "Thinking about prices", level: "decision" });
    expect(t.bus.recent().at(-1)?.type).toBe("agent.log");
    expect((await post("/agent/log", {})).statusCode).toBe(400);
  });
});

describe("WebSockets (#20, #25)", () => {
  let t: TestApp;
  let base: string;
  const open: Array<{ close(): Promise<void> }> = [];
  beforeAll(async () => {
    t = await buildTestApp({ latencyMs: 5 });
    await t.app.listen({ port: 0, host: "127.0.0.1" });
    base = `127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await Promise.all(open.splice(0).map((c) => c.close()));
  });
  afterAll(() => t.close());

  const board = (since?: number) => {
    const c = client(`ws://${base}/ws/board${since != null ? `?since=${since}` : ""}`);
    open.push(c);
    return c;
  };
  const agent = () => {
    const c = client(`ws://${base}/ws/agent`, { authorization: `Bearer ${TEST_AGENT_TOKEN}` });
    open.push(c);
    return c;
  };

  it("two board clients see the same create_task event within 2 seconds", async () => {
    const a = board();
    const b = board();
    await Promise.all([a.opened, b.opened]);
    await waitFor(() => a.messages.length > 0 && b.messages.length > 0);
    expect(a.messages[0]!.type).toBe("snapshot");
    const started = Date.now();
    const res = await createTask(t);
    const id = res.json().task_id;
    const seen = (c: typeof a) =>
      c.messages.find(
        (m) =>
          m.type === "task.created" &&
          (m as BoardEvent & { type: "task.created" }).data.task.id === id,
      );
    const [ea, eb] = await Promise.all([
      waitFor(() => seen(a), 2000),
      waitFor(() => seen(b), 2000),
    ]);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(ea.seq).toBe(eb.seq);
    await tasksIdle(t.app);
  });

  it("resyncs with since, and sends a snapshot when since is too old", async () => {
    const before = t.bus.latestSeq;
    await createTask(t);
    await tasksIdle(t.app);
    const after = t.bus.latestSeq;
    expect(after).toBeGreaterThan(before);

    const c = board(before);
    await c.opened;
    await waitFor(() => c.messages.length >= after - before);
    const seqs = c.messages.map((m) => (m as BoardServerMessage & { seq: number }).seq);
    expect(seqs).toEqual(Array.from({ length: after - before }, (_, i) => before + i + 1));
    expect(c.messages.some((m) => m.type === "snapshot")).toBe(false);

    const old = board(1);
    await old.opened;
    const snap = await waitFor(() => old.messages.find((m) => m.type === "snapshot"));
    expect(snap.seq).toBe(t.bus.latestSeq);
    expect((snap.state as BoardState).tasks.length).toBeGreaterThan(0);
  });

  it("resends unacked task.new on reconnect and stops after ack", async () => {
    const res = await createTask(t);
    const id = res.json().task_id;
    await tasksIdle(t.app);

    const first = agent();
    await first.opened;
    await waitFor(() =>
      first.messages.find((m) => m.type === "task.new" && (m.task as { id: string }).id === id),
    );
    await first.close();

    const second = agent();
    await second.opened;
    await waitFor(() =>
      second.messages.find((m) => m.type === "task.new" && (m.task as { id: string }).id === id),
    );
    second.ws.send(JSON.stringify({ type: "ack", task_id: id }));
    await waitFor(async () => {
      const [row] = await t.db.select().from(tasks).where(eq(tasks.id, id));
      return row?.agentAckedAt;
    });
    await second.close();

    const third = agent();
    await third.opened;
    await new Promise((r) => setTimeout(r, 100));
    expect(
      third.messages.some((m) => m.type === "task.new" && (m.task as { id: string }).id === id),
    ).toBe(false);
  });

  it("resends task.redeemable on reconnect for a paid sub-task", async () => {
    const f = await insertTask(t.app, { status: "claimed", subtask: "claimed" });
    await t.db
      .update(subtasks)
      .set({ paidAt: new Date() })
      .where(eq(subtasks.id, f.subtasks[0]!.subtask.id));
    const c = agent();
    await c.opened;
    const m = await waitFor(() =>
      c.messages.find((x) => x.type === "task.redeemable" && x.task_id === f.task.id),
    );
    expect(m).toMatchObject({
      amount: "6.00",
      nft_id: f.task.nftId,
      subtask_id: f.subtasks[0]!.subtask.id,
    });
  });

  it("the fake agent script claims, creates a sub-task, and redeems", async () => {
    // Ack everything older so the fake agent only sees the new task.
    await t.db.update(tasks).set({ agentAckedAt: new Date() });
    const lines: string[] = [];
    const fa = startFakeAgent({
      apiUrl: `http://${base}`,
      token: TEST_AGENT_TOKEN,
      print: (l) => lines.push(l),
    });
    try {
      await waitFor(() => lines.some((l) => l.startsWith("connected")));
      const res = await createTask(t);
      const id = res.json().task_id;
      const task = await waitFor(async () => {
        const s = await boardState(t);
        const x = s.tasks.find((y) => y.id === id);
        return x && x.status === "claimed" && x.subtasks.length === 1 ? x : null;
      });
      expect(task.subtasks[0]!.price).toBe("4.00");
      const s = await boardState(t);
      expect(s.agent_log.some((e) => e.task_id === id && e.level === "decision")).toBe(true);

      // Simulate the helper payout (bundle D) and the redeemable push.
      await t.db.update(subtasks).set({ paidAt: new Date() }).where(eq(subtasks.taskId, id));
      t.app.agentChannel.send({
        type: "task.redeemable",
        task_id: id,
        subtask_id: task.subtasks[0]!.id,
        nft_id: task.nft_id,
        amount: "6.00",
        vault_address: t.fake.vaultAddress,
      });
      await waitFor(async () => {
        const st = await boardState(t);
        return st.tasks.find((y) => y.id === id)?.status === "done";
      });
    } finally {
      await fa.stop();
    }
  });
});

describe("create_task retries (call_id dedupe)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await buildTestApp({ latencyMs: 0 });
  });
  afterAll(() => t.close());

  it("returns the same task and PIN for a retry with the same call_id", async () => {
    const first = await createTask(t, { ...PRD_EXAMPLE, call_id: "conv_retry_test" });
    const again = await createTask(t, { ...PRD_EXAMPLE, call_id: "conv_retry_test" });
    const other = await createTask(t, { ...PRD_EXAMPLE, call_id: "conv_other_call" });
    const noId = await createTask(t, { ...PRD_EXAMPLE, call_id: "" });
    expect(first.statusCode).toBe(200);
    const a = first.json<CreateTaskResponse>();
    const b = again.json<CreateTaskResponse>();
    expect(b.task_id).toBe(a.task_id);
    expect(b.pin).toBe(a.pin);
    expect(other.json<CreateTaskResponse>().task_id).not.toBe(a.task_id);
    expect(noId.json<CreateTaskResponse>().task_id).not.toBe(a.task_id);
    await tasksIdle(t.app);
  });
});
