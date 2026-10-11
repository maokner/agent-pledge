import type { AgentServerMessage, BoardEvent } from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { issueHelperToken } from "../src/auth";
import { testConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { pins, subtasks, tasks } from "../src/db/schema";
import { FakeLedger, fakeLedgerHandle } from "../src/ledger";
import { ManualClock } from "../src/lib/clock";
import { loadTaskView } from "../src/lib/views";
import { runSchedulerTick } from "../src/services/scheduler";
import { agentHeaders, buildTestApp, insertTask, type TestApp } from "./helpers";

let t: TestApp;
afterEach(async () => {
  await t?.close();
  t = undefined as unknown as TestApp;
});

function wrongPinOf(pin: string) {
  return pin === "0000" ? "1111" : "0000";
}

async function claimedFixture(app: TestApp, opts: { timeLimitMinutes?: number } = {}) {
  const f = await insertTask(app.app, { status: "claimed", subtask: "claimed", ...opts });
  const s = f.subtasks[0]!.subtask;
  const token = issueHelperToken(app.config, s.id, s.helperWalletId!);
  const pinReq = (pin: string, tok = token) =>
    app.app.inject({
      method: "POST",
      url: `/claim/${s.claimCode.toLowerCase()}/pin`,
      headers: { "x-helper-token": tok },
      payload: { pin },
    });
  return { f, s, token, pinReq };
}

function agentSocket(app: TestApp) {
  const msgs: AgentServerMessage[] = [];
  app.app.agentChannel.attach({
    readyState: 1,
    send: (d: string) => msgs.push(JSON.parse(d) as AgentServerMessage),
  });
  return msgs;
}

function events(app: TestApp, type: BoardEvent["type"]) {
  return app.bus.recent().filter((e) => e.type === type);
}

describe("POST /claim/:code/pin (#23, R8)", () => {
  it("wrong PIN pays nothing; correct PIN pays the helper and notifies the agent", async () => {
    t = await buildTestApp();
    const { f, s, pinReq } = await claimedFixture(t);
    const msgs = agentSocket(t);
    const helper = s.helperAddress!;
    const vault = t.fake.vaultAddress;
    expect(t.fake.balanceOf(helper)).toBe("0.00");
    expect(t.fake.balanceOf(vault)).toBe("10.00"); // 5 price + 1 pledge + 4 sub-task

    const wrong = await pinReq(wrongPinOf(f.pin));
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json()).toMatchObject({
      error: "wrong_pin",
      details: { attempts: 1, attempts_left: 2 },
    });
    expect(t.fake.balanceOf(helper)).toBe("0.00");
    expect(events(t, "pin.failed")).toHaveLength(1);

    const ok = await pinReq(f.pin);
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(body.payout.amount).toBe("4.00");
    expect(body.payout.explorer_url).toContain(body.payout.tx_hash);
    expect(body.claim.status).toBe("done");
    expect(body.claim.payout.tx_hash).toBe(body.payout.tx_hash);
    expect(t.fake.balanceOf(helper)).toBe("4.00");
    expect(t.fake.balanceOf(vault)).toBe("6.00");
    expect(t.fake.getNft(s.nftId!)?.burned).toBe(true);

    const [row] = await t.db.select().from(subtasks).where(eq(subtasks.id, s.id));
    expect(row).toMatchObject({ status: "done", payoutTxHash: body.payout.tx_hash });
    expect(row!.paidAt).not.toBeNull();
    expect(events(t, "subtask.paid")).toHaveLength(1);
    const kinds = events(t, "tx.validated").map(
      (e) => (e.data as { tx: { kind: string } }).tx.kind,
    );
    expect(kinds).toEqual(
      expect.arrayContaining(["helper_redeem_offer", "helper_payout", "subtask_nft_burn"]),
    );

    expect(msgs).toEqual([
      {
        type: "task.redeemable",
        task_id: f.task.id,
        subtask_id: s.id,
        nft_id: f.task.nftId,
        amount: "6.00",
        vault_address: vault,
      },
    ]);
    const [tr] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
    expect(tr!.redeemNotifiedAt).not.toBeNull();

    // A repeat of the correct PIN returns the same payout and pays nothing.
    const again = await pinReq(f.pin);
    expect(again.statusCode).toBe(200);
    expect(again.json().payout).toEqual(body.payout);
    expect(t.fake.balanceOf(helper)).toBe("4.00");
  });

  it("three wrong PINs lock the sub-task, even for the correct PIN", async () => {
    t = await buildTestApp();
    const { f, s, pinReq } = await claimedFixture(t);
    const bad = wrongPinOf(f.pin);
    expect((await pinReq(bad)).statusCode).toBe(422);
    expect((await pinReq(bad)).json().details).toEqual({ attempts: 2, attempts_left: 1 });
    const third = await pinReq(bad);
    expect(third.statusCode).toBe(423);
    expect(third.json()).toMatchObject({
      error: "pin_locked",
      details: { attempts: 3, attempts_left: 0 },
    });
    expect(events(t, "pin.locked")).toHaveLength(1);
    const correct = await pinReq(f.pin);
    expect(correct.statusCode).toBe(423);
    expect(t.fake.balanceOf(s.helperAddress!)).toBe("0.00");
    const [p] = await t.db.select().from(pins).where(eq(pins.taskId, f.task.id));
    expect(p).toMatchObject({ attempts: 3, locked: true });
  });

  it("concurrent correct PINs pay once", async () => {
    t = await buildTestApp({ latencyMs: 5 });
    const { f, s, pinReq } = await claimedFixture(t);
    const msgs = agentSocket(t);
    const results = await Promise.all([pinReq(f.pin), pinReq(f.pin), pinReq(f.pin)]);
    for (const r of results) expect(r.statusCode).toBe(200);
    const hashes = new Set(results.map((r) => r.json().payout.tx_hash));
    expect(hashes.size).toBe(1);
    expect(t.fake.balanceOf(s.helperAddress!)).toBe("4.00");
    expect(events(t, "subtask.paid")).toHaveLength(1);
    expect(msgs).toHaveLength(1);
  });

  it("needs the helper token for this sub-task", async () => {
    t = await buildTestApp();
    const a = await claimedFixture(t);
    const b = await claimedFixture(t);
    expect((await a.pinReq(a.f.pin, b.token)).statusCode).toBe(401);
    const noToken = await t.app.inject({
      method: "POST",
      url: `/claim/${a.s.claimCode}/pin`,
      payload: { pin: a.f.pin },
    });
    expect(noToken.statusCode).toBe(401);
  });
});

describe("failure flow (#24, PRD 2.3)", () => {
  it("a 1-minute task with no helper claim is failed and refunded automatically", async () => {
    t = await buildTestApp({ config: { SCHEDULER_INTERVAL_MS: "100" } });
    const f = await insertTask(t.app, { status: "claimed", subtask: "open", timeLimitMinutes: 1 });
    const requester = f.task.requesterAddress!;
    expect(t.fake.balanceOf(requester)).toBe("0.00");
    expect(t.fake.balanceOf(t.fake.agentAddress)).toBe("95.00");

    t.clock.advance(61_000);
    const deadline = Date.now() + 3000;
    let view = await loadTaskView(t.db, t.app.viewCtx, f.task.id);
    while (!view?.refunded_at && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      view = await loadTaskView(t.db, t.app.viewCtx, f.task.id);
    }
    expect(view).toMatchObject({
      status: "failed",
      fail_reason: "No helper claimed the sub-task in time",
    });
    expect(view!.subtasks[0]!.status).toBe("failed");
    expect(t.fake.balanceOf(requester)).toBe("6.00"); // price + pledge
    expect(t.fake.balanceOf(t.fake.agentAddress)).toBe("99.00"); // sub-task money back
    expect(t.fake.balanceOf(t.fake.vaultAddress)).toBe("0.00");
    expect(t.fake.getNft(f.task.nftId!)?.burned).toBe(true);
    const failed = events(t, "task.failed");
    expect(failed).toHaveLength(1);
    const kinds = view!.transactions.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(["refund_requester", "refund_agent"]));
    // The board state shows it.
    const board = (await t.app.inject({ method: "GET", url: "/board/state" })).json();
    if (board.tasks) expect(board.tasks[0].status).toBe("failed");
  });

  it("claimed but no PIN: refunds the requester and the agent's sub-task money", async () => {
    t = await buildTestApp();
    const { f, s } = await claimedFixture(t, { timeLimitMinutes: 3 });
    t.clock.advance(2 * 60_000);
    expect(await runSchedulerTick(t.app)).toEqual([]);
    t.clock.advance(61_000);
    expect(await runSchedulerTick(t.app)).toEqual([f.task.id]);
    const view = (await loadTaskView(t.db, t.app.viewCtx, f.task.id))!;
    expect(view).toMatchObject({
      status: "failed",
      fail_reason: "No correct PIN before the time limit",
    });
    expect(t.fake.balanceOf(f.task.requesterAddress!)).toBe("6.00");
    expect(t.fake.balanceOf(t.fake.agentAddress)).toBe("99.00");
    expect(t.fake.balanceOf(s.helperAddress!)).toBe("0.00");
    expect(t.fake.getNft(s.nftId!)?.burned).toBe(true);
    // Running again does nothing.
    expect(await runSchedulerTick(t.app)).toEqual([]);
    expect(t.fake.balanceOf(f.task.requesterAddress!)).toBe("6.00");
  });

  it("agent never claimed: requester gets the price back (no pledge was paid)", async () => {
    t = await buildTestApp();
    const f = await insertTask(t.app, { status: "open", timeLimitMinutes: 1 });
    t.clock.advance(61_000);
    expect(await runSchedulerTick(t.app)).toEqual([f.task.id]);
    expect(t.fake.balanceOf(f.task.requesterAddress!)).toBe("5.00");
    expect(t.fake.balanceOf(t.fake.agentAddress)).toBe("100.00");
    const [row] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
    expect(row!.failReason).toBe("The agent never claimed the task");
  });

  it("a task with a paid sub-task is not failed", async () => {
    t = await buildTestApp();
    const { f, pinReq } = await claimedFixture(t, { timeLimitMinutes: 1 });
    expect((await pinReq(f.pin)).statusCode).toBe(200);
    t.clock.advance(5 * 60_000);
    expect(await runSchedulerTick(t.app)).toEqual([]);
    const [row] = await t.db.select().from(tasks).where(eq(tasks.id, f.task.id));
    expect(row!.status).toBe("claimed");
    expect(row!.refundStartedAt).toBeNull();
    const res = await t.app.inject({
      method: "POST",
      url: `/admin/tasks/${f.task.id}/fail`,
      headers: agentHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  it("a correct PIN after the task failed pays nothing", async () => {
    t = await buildTestApp();
    const { f, s, pinReq } = await claimedFixture(t, { timeLimitMinutes: 1 });
    t.clock.advance(61_000);
    await runSchedulerTick(t.app);
    expect((await pinReq(f.pin)).statusCode).toBe(410);
    expect(t.fake.balanceOf(s.helperAddress!)).toBe("0.00");
  });

  it("POST /admin/tasks/:id/fail fails a task on purpose, once", async () => {
    t = await buildTestApp();
    const f = await insertTask(t.app, { status: "claimed", subtask: "open" });
    const noAuth = await t.app.inject({ method: "POST", url: `/admin/tasks/${f.task.id}/fail` });
    expect(noAuth.statusCode).toBe(401);
    const fail = () =>
      t.app.inject({
        method: "POST",
        url: `/admin/tasks/${f.task.id}/fail`,
        headers: agentHeaders,
        payload: {},
      });
    const [a, b] = await Promise.all([fail(), fail()]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json().task).toMatchObject({ status: "failed", fail_reason: "manual" });
    expect((await fail()).statusCode).toBe(200);
    expect(t.fake.balanceOf(f.task.requesterAddress!)).toBe("6.00");
    expect(t.fake.balanceOf(t.fake.agentAddress)).toBe("99.00");
    expect(events(t, "task.failed")).toHaveLength(1);
    const missing = await t.app.inject({
      method: "POST",
      url: "/admin/tasks/task_nope/fail",
      headers: agentHeaders,
      payload: {},
    });
    expect(missing.statusCode).toBe(404);
  });

  it("a restart mid-failure resumes the refund and never refunds twice", async () => {
    const dbh = await createDb("memory://");
    await dbh.migrate();
    const fake = new FakeLedger({ latencyMs: 0, agentBalance: "100.00" });
    const clock = new ManualClock();
    const config = testConfig();
    const boot = () => buildApp({ config, db: dbh.db, ledger: fakeLedgerHandle(fake), clock });

    const app1 = await boot();
    await app1.ready();
    const crashed = await insertTask(app1, {
      status: "claimed",
      subtask: "open",
      timeLimitMinutes: 1,
    });
    const notStarted = await insertTask(app1, {
      status: "claimed",
      subtask: "open",
      timeLimitMinutes: 1,
    });
    // Simulate a crash: both refunds were claimed; only the first reached the ledger.
    for (const f of [crashed, notStarted]) {
      await dbh.db
        .update(tasks)
        .set({
          refundStartedAt: clock.now(),
          status: "failed",
          failReason: "No helper claimed the sub-task in time",
        })
        .where(eq(tasks.id, f.task.id));
    }
    const sub = crashed.subtasks[0]!.subtask;
    await fake.failTask({
      taskId: crashed.task.id,
      taskNftId: crashed.task.nftId,
      subtaskNftIds: [sub.nftId!],
      subtaskIds: [sub.id],
      requesterAddress: crashed.task.requesterAddress!,
      refundToRequester: "6.00",
      agentAddress: fake.agentAddress,
      refundToAgent: "4.00",
    });
    await app1.close();

    const app2 = await boot();
    await app2.ready();
    try {
      const done = await runSchedulerTick(app2);
      expect(done.sort()).toEqual([crashed.task.id, notStarted.task.id].sort());
      expect(fake.balanceOf(crashed.task.requesterAddress!)).toBe("6.00");
      expect(fake.balanceOf(notStarted.task.requesterAddress!)).toBe("6.00");
      expect(fake.balanceOf(fake.agentAddress)).toBe("98.00"); // 100 - 2*(1+4) + 2*4
      expect(fake.balanceOf(fake.vaultAddress)).toBe("0.00");
      for (const f of [crashed, notStarted]) {
        const [row] = await dbh.db.select().from(tasks).where(eq(tasks.id, f.task.id));
        expect(row!.refundedAt).not.toBeNull();
      }
      expect(await runSchedulerTick(app2)).toEqual([]);
      expect(fake.balanceOf(fake.vaultAddress)).toBe("0.00");
    } finally {
      await app2.close();
      await dbh.close();
    }
  });
});
