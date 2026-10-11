import { fromCents } from "@agent-pledge/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventBus } from "../src/events/bus";
import { decryptSeed, encryptSeed } from "../src/lib/seed-crypto";
import { hashPin, verifyPin } from "../src/lib/pin";
import { issueHelperToken, verifyHelperToken } from "../src/auth";
import { ManualClock } from "../src/lib/clock";
import { loadBoardState } from "../src/lib/views";
import { buildTestApp, insertTask, type TestApp } from "./helpers";

describe("EventBus", () => {
  it("assigns increasing seq, replays since, and asks for a snapshot when too far behind", () => {
    const bus = new EventBus(new ManualClock(), 3, 100);
    const got: number[] = [];
    bus.subscribe((e) => got.push(e.seq));
    for (let i = 0; i < 5; i++)
      bus.publish("pin.failed", { task_id: "t", subtask_id: "s", attempts: 1, attempts_left: 2 });
    expect(got).toEqual([101, 102, 103, 104, 105]);
    expect(bus.since(105)).toEqual([]);
    expect(bus.since(103)!.map((e) => e.seq)).toEqual([104, 105]);
    expect(bus.since(102)!.map((e) => e.seq)).toEqual([103, 104, 105]);
    expect(bus.since(101)).toBeNull();
    expect(bus.since(999)).toBeNull();
  });
});

describe("crypto helpers", () => {
  it("encrypts seeds, hashes PINs, signs helper tokens", () => {
    const enc = encryptSeed("sEdSECRET", "key-123456789012345");
    expect(enc).not.toContain("sEdSECRET");
    expect(decryptSeed(enc, "key-123456789012345")).toBe("sEdSECRET");
    expect(() => decryptSeed(enc, "other-key-12345678")).toThrow();
    const h = hashPin("4821");
    expect(verifyPin("4821", h)).toBe(true);
    expect(verifyPin("4822", h)).toBe(false);
  });
});

describe("database + factories", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await buildTestApp();
  });
  afterAll(() => t.close());

  it("creates one task per status with consistent views and transactions", async () => {
    await insertTask(t.app, { status: "open" });
    const claimed = await insertTask(t.app, { status: "claimed", subtask: "claimed" });
    await insertTask(t.app, { status: "done" });
    await insertTask(t.app, { status: "failed" });
    const state = await loadBoardState(t.db, t.app.viewCtx, t.bus.latestSeq);
    expect(state.tasks.map((x) => x.status).sort()).toEqual(["claimed", "done", "failed", "open"]);

    const done = state.tasks.find((x) => x.status === "done")!;
    expect(done.subtasks[0]!.status).toBe("done");
    expect(done.subtasks[0]!.photo?.url).toMatch(/^http:\/\/api\.test\/media\/med_/);
    expect(done.transactions.every((x) => x.status === "validated")).toBe(true);
    expect(done.transactions.map((x) => x.kind)).toEqual(
      expect.arrayContaining([
        "task_funding",
        "task_claim",
        "subtask_funding",
        "helper_payout",
        "agent_payout",
        "task_nft_burn",
      ]),
    );
    expect(done.pin).toEqual({ attempts: 0, attempts_left: 3, locked: false, verified: true });

    const failed = state.tasks.find((x) => x.status === "failed")!;
    expect(failed.transactions.map((x) => x.kind)).toEqual(
      expect.arrayContaining(["refund_requester", "refund_agent"]),
    );
    expect(state.agent_log.length).toBeGreaterThan(0);

    // Helper token bound to the sub-task.
    const sub = claimed.subtasks[0]!.subtask;
    const tok = issueHelperToken(t.config, sub.id, sub.helperWalletId!);
    expect(verifyHelperToken(t.config, tok, sub.id)?.wid).toBe(sub.helperWalletId);
    expect(verifyHelperToken(t.config, tok, "sub_other")).toBeNull();

    // Ledger bridge published tx events to the bus.
    expect(t.bus.recent().some((e) => e.type === "tx.validated")).toBe(true);
    // Money adds up: the agent ends +1.00 on the done task, -1.00 on the failed one, -5.00 locked on claimed.
    expect(t.fake.balanceOf(t.fake.agentAddress)).toBe(fromCents(10000 + 100 - 100 - 100 - 400));
  });
});
