/**
 * Proof photo pays the helper (PROOF_MODE=photo), POST /claim/:code/pay, the PIN alongside it,
 * and the claim view's NFT, escrow, and ledger fields.
 */
import { createHash } from "node:crypto";
import {
  BoardState,
  ClaimSubtaskResponse,
  ClaimView,
  LedgerNetworkError,
  PayResponse,
  PhotoResponse,
  PinResponse,
  type AgentServerMessage,
  type BoardEvent,
} from "@agent-pledge/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { issueHelperToken } from "../src/auth";
import { pins, subtasks } from "../src/db/schema";
import { agentHeaders, buildTestApp, insertTask, type TestApp } from "./helpers";
import { multipart } from "./multipart";

let t: TestApp;
afterEach(async () => {
  await t?.close();
  t = undefined as unknown as TestApp;
});

const jpeg = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: "#2a6f4e" } })
    .jpeg()
    .toBuffer();
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function agentSocket(app: TestApp) {
  const msgs: AgentServerMessage[] = [];
  app.app.agentChannel.attach({
    readyState: 1,
    send: (d: string) => msgs.push(JSON.parse(d) as AgentServerMessage),
  });
  return msgs;
}
const events = (app: TestApp, type: BoardEvent["type"]) =>
  app.bus.recent().filter((e) => e.type === type);

/** An open sub-task claimed through the API. */
async function claimed(app: TestApp, opts: { timeLimitMinutes?: number } = {}) {
  const f = await insertTask(app.app, { status: "claimed", subtask: "open", ...opts });
  const s = f.subtasks[0]!.subtask;
  const res = await app.app.inject({ method: "POST", url: `/claim/${s.claimCode}/claim` });
  expect(res.statusCode).toBe(200);
  const { helper_token: token, claim } = ClaimSubtaskResponse.parse(res.json());
  const h = { "x-helper-token": token };
  const [row] = await app.db.select().from(subtasks).where(eq(subtasks.id, s.id));
  return {
    f,
    s: row!,
    code: s.claimCode,
    token,
    claim,
    photo: async (fields: Record<string, string> = {}, file?: Buffer | null) => {
      const body = multipart(
        fields,
        file === null ? undefined : { buffer: file ?? (await jpeg()) },
      );
      return app.app.inject({
        method: "POST",
        url: `/claim/${s.claimCode}/photo`,
        payload: body.payload,
        headers: { ...body.headers, ...h },
      });
    },
    pay: (headers: Record<string, string> = h) =>
      app.app.inject({ method: "POST", url: `/claim/${s.claimCode}/pay`, headers }),
    pin: (pin: string) =>
      app.app.inject({
        method: "POST",
        url: `/claim/${s.claimCode}/pin`,
        headers: h,
        payload: { pin },
      }),
    view: async (headers: Record<string, string> = h) =>
      ClaimView.parse(
        (await app.app.inject({ url: `/claim/${s.claimCode.toLowerCase()}`, headers })).json(),
      ),
  };
}

/** sha256 of the bytes GET /media/:id serves. */
async function servedSha256(app: TestApp, url: string): Promise<string> {
  const res = await app.app.inject({ url: new URL(url).pathname });
  expect(res.statusCode).toBe(200);
  return sha256(res.rawPayload);
}

describe("POST /claim/:code/photo pays in photo mode (the default)", () => {
  it("pays the helper with the photo's sha256 in the payout memos, then task.redeemable", async () => {
    t = await buildTestApp();
    expect(t.config.PROOF_MODE).toBe("photo");
    const c = await claimed(t);
    const msgs = agentSocket(t);
    const helper = c.s.helperAddress!;

    const res = await c.photo({ note: "Front table" });
    expect(res.statusCode).toBe(200);
    const body = PhotoResponse.parse(res.json());
    expect(body.payout).not.toBeNull();
    expect(body.payout!.amount).toBe("4.00");
    expect(body.payout!.explorer_url).toBe(
      `https://testnet.xrpl.org/transactions/${body.payout!.tx_hash}`,
    );
    expect(body.claim).toMatchObject({ status: "done", proof: "photo", payout: body.payout });
    expect(t.fake.balanceOf(helper)).toBe("4.00");
    expect(t.fake.getNft(c.s.nftId!)?.burned).toBe(true);

    // The proof hash is the sha256 of the stored (re-encoded) bytes, and both payout txs carry it.
    const hash = await servedSha256(t, body.media!.url);
    expect(body.claim.proof_sha256).toBe(hash);
    const offerTx = body.claim.transactions.find((x) => x.kind === "helper_redeem_offer")!;
    expect(t.fake.proofOf(offerTx.hash)).toBe(hash);
    expect(t.fake.proofOf(body.payout!.tx_hash)).toBe(hash);
    const burn = body.claim.transactions.find((x) => x.kind === "subtask_nft_burn")!;
    expect(t.fake.proofOf(burn.hash)).toBeUndefined();

    expect(events(t, "photo.added")).toHaveLength(1);
    expect(events(t, "subtask.paid")).toHaveLength(1);
    expect(msgs).toEqual([
      {
        type: "task.redeemable",
        task_id: c.f.task.id,
        subtask_id: c.s.id,
        nft_id: c.f.task.nftId,
        amount: "6.00",
        vault_address: t.fake.vaultAddress,
      },
    ]);

    // The local agent then redeems the task NFT, as after a PIN payout.
    const redeem = await t.app.inject({
      method: "POST",
      url: `/agent/tasks/${c.f.task.id}/redeem`,
      headers: agentHeaders,
      payload: {},
    });
    expect(redeem.statusCode).toBe(200);
    expect(redeem.json()).toMatchObject({ amount: "6.00", task: { status: "done" } });

    // A later photo submit pays nothing more.
    expect((await c.photo()).statusCode).toBe(409);
    expect(t.fake.balanceOf(helper)).toBe("4.00");
  });

  it("a note alone does not pay", async () => {
    t = await buildTestApp();
    const c = await claimed(t);
    const res = await c.photo({ note: "On my way" }, null);
    expect(res.statusCode).toBe(200);
    const body = PhotoResponse.parse(res.json());
    expect(body).toMatchObject({ media: null, payout: null, claim: { status: "claimed" } });
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("0.00");
  });

  it("a double submit pays once", async () => {
    t = await buildTestApp({ latencyMs: 5 });
    const c = await claimed(t);
    const msgs = agentSocket(t);
    const file = await jpeg();
    const results = await Promise.all([c.photo({}, file), c.photo({}, file), c.photo({}, file)]);
    const ok = results.filter((r) => r.statusCode === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((r) => r.statusCode !== 200)) {
      expect(r.statusCode).toBe(409);
      expect(r.json().error).toBe("conflict");
    }
    const hashes = new Set(ok.map((r) => PhotoResponse.parse(r.json()).payout!.tx_hash));
    expect(hashes.size).toBe(1);
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("4.00");
    expect(events(t, "subtask.paid")).toHaveLength(1);
    expect(msgs).toHaveLength(1);
    // The memo hash matches the photo the sub-task keeps.
    const v = await c.view();
    expect(t.fake.proofOf(v.payout!.tx_hash)).toBe(v.proof_sha256);
  });

  it("a ledger error answers 502 and keeps the photo; POST /pay then pays, idempotently", async () => {
    t = await buildTestApp();
    const c = await claimed(t);
    const msgs = agentSocket(t);
    const accept = t.fake.acceptRedeemOffer.bind(t.fake);
    t.fake.acceptRedeemOffer = async () => {
      throw new LedgerNetworkError("testnet down");
    };
    const res = await c.photo();
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("ledger_error");
    const kept = await c.view();
    expect(kept).toMatchObject({ status: "claimed", payout: null });
    expect(kept.photo).not.toBeNull();
    expect(kept.proof_sha256).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await t.db.select().from(subtasks).where(eq(subtasks.id, c.s.id));
    expect(row!.payoutStartedAt).toBeNull();
    expect(msgs).toHaveLength(0);

    t.fake.acceptRedeemOffer = accept;
    const pay = await c.pay();
    expect(pay.statusCode).toBe(200);
    const first = PayResponse.parse(pay.json());
    expect(first.payout.amount).toBe("4.00");
    expect(first.claim).toMatchObject({ status: "done", payout: first.payout });
    expect(t.fake.proofOf(first.payout.tx_hash)).toBe(kept.proof_sha256);
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("4.00");
    expect(msgs.map((m) => m.type)).toEqual(["task.redeemable"]);

    // Idempotent, even after the deadline.
    t.clock.advance(30 * 60_000);
    const again = await c.pay();
    expect(again.statusCode).toBe(200);
    expect(PayResponse.parse(again.json()).payout).toEqual(first.payout);
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("4.00");
    expect(events(t, "subtask.paid")).toHaveLength(1);
  });
});

describe("POST /claim/:code/pay", () => {
  it("409 without a photo, 401 without the helper token", async () => {
    t = await buildTestApp();
    const c = await claimed(t);
    expect((await c.pay({})).statusCode).toBe(401);
    const res = await c.pay();
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "conflict", message: "Send the proof photo first" });
    // A note is not a photo.
    await c.photo({ note: "Here" }, null);
    expect((await c.pay()).statusCode).toBe(409);
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("0.00");
  });

  it("pays for a photo that is already stored", async () => {
    t = await buildTestApp();
    // The factory stores a photo for a claimed sub-task.
    const f = await insertTask(t.app, { status: "claimed", subtask: "claimed" });
    const s = f.subtasks[0]!.subtask;
    const token = issueHelperToken(t.config, s.id, s.helperWalletId!);
    const res = await t.app.inject({
      method: "POST",
      url: `/claim/${s.claimCode}/pay`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = PayResponse.parse(res.json());
    expect(t.fake.proofOf(body.payout.tx_hash)).toBe(body.claim.proof_sha256);
    expect(body.claim.proof_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("410 when the deadline passed or the task failed", async () => {
    t = await buildTestApp();
    const c = await claimed(t, { timeLimitMinutes: 3 });
    t.fake.acceptRedeemOffer = async () => {
      throw new LedgerNetworkError("down");
    };
    expect((await c.photo()).statusCode).toBe(502);
    t.clock.advance(4 * 60_000);
    const late = await c.pay();
    expect(late.statusCode).toBe(410);
    expect(late.json().error).toBe("expired");

    // A claimed sub-task with a photo whose task failed on purpose.
    const f = await insertTask(t.app, { status: "claimed", subtask: "claimed" });
    const fs = f.subtasks[0]!.subtask;
    const fail = await t.app.inject({
      method: "POST",
      url: `/admin/tasks/${f.task.id}/fail`,
      headers: agentHeaders,
      payload: {},
    });
    expect(fail.statusCode).toBe(200);
    const res = await t.app.inject({
      method: "POST",
      url: `/claim/${fs.claimCode}/pay`,
      headers: { "x-helper-token": issueHelperToken(t.config, fs.id, fs.helperWalletId!) },
    });
    expect(res.statusCode).toBe(410);
    expect(t.fake.balanceOf(fs.helperAddress!)).toBe("0.00");
  });
});

describe("PIN mode", () => {
  it("the photo does not pay, POST /pay is 409, and the PIN pays without a proof memo", async () => {
    t = await buildTestApp({ config: { PROOF_MODE: "pin" } });
    const c = await claimed(t);
    const res = await c.photo();
    expect(res.statusCode).toBe(200);
    const body = PhotoResponse.parse(res.json());
    expect(body.payout).toBeNull();
    expect(body.claim).toMatchObject({ status: "claimed", proof: "pin" });
    expect(body.claim.proof_sha256).toBe(await servedSha256(t, body.media!.url));

    const pay = await c.pay();
    expect(pay.statusCode).toBe(409);
    expect(pay.json()).toMatchObject({
      error: "conflict",
      message: "The requester's PIN pays this task",
    });
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("0.00");

    const pin = await c.pin(c.f.pin);
    expect(pin.statusCode).toBe(200);
    const paid = PinResponse.parse(pin.json());
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("4.00");
    expect(t.fake.proofOf(paid.payout.tx_hash)).toBeUndefined();
  });
});

describe("POST /claim/:code/pin after a photo payout", () => {
  it("the correct PIN returns the same payout and records the PIN", async () => {
    t = await buildTestApp();
    const c = await claimed(t, { timeLimitMinutes: 3 });
    const photo = PhotoResponse.parse((await c.photo()).json());
    // Even past the time limit: the helper is already paid.
    t.clock.advance(5 * 60_000);
    const res = await c.pin(c.f.pin);
    expect(res.statusCode).toBe(200);
    const body = PinResponse.parse(res.json());
    expect(body.payout).toEqual(photo.payout);
    expect(body.claim.pin.verified).toBe(true);
    const [p] = await t.db.select().from(pins).where(eq(pins.taskId, c.f.task.id));
    expect(p!.verifiedSubtaskId).toBe(c.s.id);
    expect(t.fake.balanceOf(c.s.helperAddress!)).toBe("4.00");
    // And again.
    expect(PinResponse.parse((await c.pin(c.f.pin)).json()).payout).toEqual(photo.payout);
  });

  it("works in photo mode without a photo, as before", async () => {
    t = await buildTestApp();
    const c = await claimed(t);
    const res = await c.pin(c.f.pin);
    expect(res.statusCode).toBe(200);
    const body = PinResponse.parse(res.json());
    expect(t.fake.proofOf(body.payout.tx_hash)).toBeUndefined();
    expect(body.claim.proof_sha256).toBeNull();
  });
});

describe("GET /claim/:code: proof, NFT, escrow, and transactions", () => {
  it("follows the sub-task from open to claimed to paid and burned", async () => {
    t = await buildTestApp();
    const f = await insertTask(t.app, { status: "claimed", subtask: "open" });
    const s = f.subtasks[0]!.subtask;
    const board = BoardState.parse((await t.app.inject({ url: "/board/state" })).json());

    const open = ClaimView.parse((await t.app.inject({ url: `/claim/${s.claimCode}` })).json());
    expect(open).toMatchObject({
      proof: "photo",
      proof_sha256: null,
      nft: {
        id: s.nftId,
        explorer_url: `https://testnet.xrpl.org/nft/${s.nftId}`,
        holder: "vault",
        parent_nft_id: f.task.nftId,
        parent_explorer_url: `https://testnet.xrpl.org/nft/${f.task.nftId}`,
      },
      escrow: {
        amount: "4.00",
        vault_address: board.vault_address,
        vault_explorer_url: `https://testnet.xrpl.org/accounts/${board.vault_address}`,
      },
    });
    expect(open.escrow.vault_address).toBe(t.fake.vaultAddress);
    expect(open.transactions.map((x) => x.kind)).toEqual([
      "subtask_funding",
      "subtask_nft_mint",
      "subtask_offer",
    ]);

    const c = await t.app.inject({ method: "POST", url: `/claim/${s.claimCode}/claim` });
    const token = ClaimSubtaskResponse.parse(c.json()).helper_token;
    const mine = ClaimView.parse(
      (
        await t.app.inject({ url: `/claim/${s.claimCode}`, headers: { "x-helper-token": token } })
      ).json(),
    );
    expect(mine.nft!.holder).toBe("you");
    const theirs = ClaimView.parse((await t.app.inject({ url: `/claim/${s.claimCode}` })).json());
    expect(theirs.nft!.holder).toBe("helper");
    expect(theirs.transactions.at(-1)!.kind).toBe("subtask_claim");

    const body = multipart({}, { buffer: await jpeg() });
    const photo = PhotoResponse.parse(
      (
        await t.app.inject({
          method: "POST",
          url: `/claim/${s.claimCode}/photo`,
          payload: body.payload,
          headers: { ...body.headers, "x-helper-token": token },
        })
      ).json(),
    );
    const done = ClaimView.parse((await t.app.inject({ url: `/claim/${s.claimCode}` })).json());
    expect(done.nft!.holder).toBe("burned");
    expect(done.proof_sha256).toBe(await servedSha256(t, photo.media!.url));
    expect(done.transactions.map((x) => x.kind)).toEqual([
      "subtask_funding",
      "subtask_nft_mint",
      "subtask_offer",
      "subtask_claim",
      "helper_redeem_offer",
      "helper_payout",
      "subtask_nft_burn",
    ]);
    for (const x of done.transactions) {
      expect(x.subtask_id).toBe(s.id);
      expect(x.status).toBe("validated");
    }
    const payoutTx = done.transactions.find((x) => x.kind === "helper_payout")!;
    expect(payoutTx).toMatchObject({ hash: photo.payout!.tx_hash, amount: "4.00" });
    // Oldest first.
    const times = done.transactions.map((x) => x.created_at);
    expect([...times].sort()).toEqual(times);
  });
});
