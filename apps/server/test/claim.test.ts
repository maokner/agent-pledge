import {
  AlreadyClaimedError,
  ClaimSubtaskResponse,
  ClaimView,
  LedgerNetworkError,
  type BoardEvent,
} from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { subtasks, wallets } from "../src/db/schema";
import { decryptSeed } from "../src/lib/seed-crypto";
import { buildTestApp, insertTask, type TestApp } from "./helpers";

let t: TestApp;
let events: BoardEvent[];
beforeEach(async () => {
  t = await buildTestApp();
  events = [];
  t.bus.subscribe((e) => events.push(e));
});
afterEach(() => t.close());

async function openSubtask() {
  const f = await insertTask(t.app, { status: "claimed", subtask: "open" });
  return f.subtasks[0]!.subtask;
}

const claim = (code: string) => t.app.inject({ method: "POST", url: `/claim/${code}/claim` });

describe("GET /claim/:code", () => {
  it("returns the claim view, case-insensitively", async () => {
    const s = await openSubtask();
    const res = await t.app.inject({ url: `/claim/${s.claimCode.toLowerCase()}` });
    expect(res.statusCode).toBe(200);
    const v = ClaimView.parse(res.json());
    expect(v).toMatchObject({ code: s.claimCode, status: "open", claimed_by_you: false });
    expect(v.price).toBe("4.00");
  });

  it("404s on an unknown code", async () => {
    expect((await t.app.inject({ url: "/claim/ZZZZ" })).statusCode).toBe(404);
    expect((await t.app.inject({ url: "/claim/not-a-code" })).statusCode).toBe(404);
  });
});

describe("POST /claim/:code/claim", () => {
  it("claims: wallet, ledger accept, cookie + token, subtask.claimed", async () => {
    const s = await openSubtask();
    const res = await claim(s.claimCode);
    expect(res.statusCode).toBe(200);
    const body = ClaimSubtaskResponse.parse(res.json());
    expect(body.claim).toMatchObject({ status: "claimed", claimed_by_you: true });

    const cookie = res.cookies.find((c) => c.name === `ap_helper_${s.claimCode}`);
    expect(cookie?.httpOnly).toBe(true);

    const [row] = await t.db.select().from(subtasks).where(eq(subtasks.id, s.id));
    expect(row).toMatchObject({ status: "claimed" });
    expect(row!.claimTxHash).toMatch(/^[0-9A-F]{64}$/);
    const [w] = await t.db.select().from(wallets).where(eq(wallets.id, row!.helperWalletId!));
    expect(w).toMatchObject({ role: "helper", subtaskId: s.id, address: row!.helperAddress });
    const seed = decryptSeed(w!.encryptedSeed!, t.config.SEED_ENCRYPTION_KEY);
    expect(t.fake.addressForSeed(seed)).toBe(row!.helperAddress);
    // The helper wallet now holds the sub-task NFT.
    expect(t.fake.getNft(s.nftId!)?.owner).toBe(row!.helperAddress);

    const ev = events.find((e) => e.type === "subtask.claimed");
    expect(ev?.data).toMatchObject({ subtask: { id: s.id, status: "claimed" } });

    // The same phone sees claimed_by_you via the cookie or the header; others do not.
    const viaCookie = await t.app.inject({
      url: `/claim/${s.claimCode}`,
      cookies: { [cookie!.name]: cookie!.value },
    });
    expect(viaCookie.json().claimed_by_you).toBe(true);
    const viaHeader = await t.app.inject({
      url: `/claim/${s.claimCode}`,
      headers: { "x-helper-token": body.helper_token },
    });
    expect(viaHeader.json().claimed_by_you).toBe(true);
    expect((await t.app.inject({ url: `/claim/${s.claimCode}` })).json().claimed_by_you).toBe(
      false,
    );
  });

  it("two simultaneous claims: one 200, one 409 already_claimed", async () => {
    const s = await openSubtask();
    const results = await Promise.all([claim(s.claimCode), claim(s.claimCode)]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error).toBe("already_claimed");
    const helpers = await t.db.select().from(wallets).where(eq(wallets.subtaskId, s.id));
    expect(helpers).toHaveLength(1);
    // A later claim is also 409.
    expect((await claim(s.claimCode)).statusCode).toBe(409);
  });

  it("410 when the deadline has passed", async () => {
    const s = await openSubtask();
    t.clock.advance(11 * 60_000);
    const res = await claim(s.claimCode);
    expect(res.statusCode).toBe(410);
    expect(res.json().error).toBe("expired");
  });

  it("410 when the sub-task failed", async () => {
    const f = await insertTask(t.app, { status: "failed" });
    const res = await claim(f.subtasks[0]!.subtask.claimCode);
    expect(res.statusCode).toBe(410);
  });

  it("409 when the ledger says the offer is already taken", async () => {
    const s = await openSubtask();
    t.fake.acceptOffer = async () => {
      throw new AlreadyClaimedError();
    };
    const res = await claim(s.claimCode);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("already_claimed");
  });

  it("502 and rollback to open on any other ledger failure", async () => {
    const s = await openSubtask();
    const original = t.fake.acceptOffer.bind(t.fake);
    t.fake.acceptOffer = async () => {
      throw new LedgerNetworkError();
    };
    const res = await claim(s.claimCode);
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("ledger_error");
    const [row] = await t.db.select().from(subtasks).where(eq(subtasks.id, s.id));
    expect(row).toMatchObject({ status: "open", claimStartedAt: null });

    t.fake.acceptOffer = original;
    expect((await claim(s.claimCode)).statusCode).toBe(200);
  });
});
