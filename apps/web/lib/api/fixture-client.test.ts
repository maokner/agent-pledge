import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_CLAIM_CODES, FIXTURE_PIN } from "../fixtures/claims";
import { createFixtureApiClient } from "./fixture-client";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-11T19:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

/** Runs a fixture call to completion (fixture calls simulate latency with timers). */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const result = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(10_000);
  const outcome = await result;
  if ("error" in outcome) throw outcome.error;
  return outcome.value;
}

describe("fixture API client", () => {
  it("starts each fixture claim code in its documented state", async () => {
    const api = createFixtureApiClient();
    for (const [code, state] of Object.entries(FIXTURE_CLAIM_CODES)) {
      expect((await settle(api.getClaim(code))).state, code).toBe(state);
    }
  });

  it("rejects an unknown code as not_found", async () => {
    const api = createFixtureApiClient();
    await expect(settle(api.getClaim("ZZZZ"))).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("OPEN: claim, then the photo pays at once, with the ledger growing to the burn", async () => {
    const api = createFixtureApiClient();

    const open = await settle(api.getClaim("OPEN"));
    expect(open.proof).toBe("photo");
    expect(open.nft).toMatchObject({ holder: "vault" });
    expect(open.nft?.id).toMatch(/^00080000[0-9A-F]{56}$/);
    expect(open.escrow?.vault_address).toBe("r37hDaqXGUL574V8y91XSoktYDpc9HpPjN");
    expect(open.transactions.map((tx) => [tx.kind, tx.status])).toEqual([
      ["subtask_escrow", "validated"],
      ["subtask_nft_mint", "validated"],
      ["subtask_nft_offer", "validated"],
    ]);

    const claimed = await settle(api.claimSubtask("OPEN"));
    expect(claimed.state).toBe("claimed_by_you");
    expect(claimed.nft?.holder).toBe("you");
    expect(claimed.transactions.at(-1)).toMatchObject({
      kind: "subtask_claim",
      status: "validated",
    });

    const paid = await settle(api.uploadPhoto("OPEN", new Blob(["seat"]), "Front table"));
    expect(paid.state).toBe("paid");
    expect(paid.photo?.note).toBe("Front table");
    expect(paid.proof_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(paid.payout).toMatchObject({ amount: paid.subtask.price, status: "validated" });
    expect(paid.payout?.explorer_url).toBe(
      `https://testnet.xrpl.org/transactions/${paid.payout?.tx_hash}`,
    );
    const payoutTx = paid.transactions.find((tx) => tx.kind === "helper_payout");
    expect(payoutTx).toMatchObject({ hash: paid.payout?.tx_hash, status: "validated" });

    await vi.advanceTimersByTimeAsync(5000);
    const burned = await settle(api.getClaim("OPEN"));
    expect(burned.transactions.map((tx) => tx.kind)).toEqual([
      "subtask_escrow",
      "subtask_nft_mint",
      "subtask_nft_offer",
      "subtask_claim",
      "helper_payout_offer",
      "helper_payout",
      "nft_burn",
    ]);
    expect(burned.transactions.every((tx) => tx.status === "validated")).toBe(true);
    expect(burned.nft?.holder).toBe("burned");
  });

  it("shows the paying state for about 4 seconds while the photo call pays", async () => {
    const api = createFixtureApiClient();
    await settle(api.claimSubtask("OPEN"));
    let done = false;
    void api.uploadPhoto("OPEN", new Blob(["seat"]), "").then(() => (done = true));

    await vi.advanceTimersByTimeAsync(1500 + 3000);
    expect(done).toBe(false);
    const during = api.getClaim("OPEN");
    await vi.advanceTimersByTimeAsync(300);
    expect((await during).state).toBe("paying");
    await vi.advanceTimersByTimeAsync(1500);
    expect(done).toBe(true);
  });

  it("MINE: the photo call answers without a payout, and pay finishes it", async () => {
    const api = createFixtureApiClient();

    const paying = await settle(api.uploadPhoto("MINE", new Blob(["seat"]), ""));
    expect(paying.state).toBe("paying");
    expect(paying.payout).toBeNull();

    const paid = await settle(api.pay("MINE"));
    expect(paid.state).toBe("paid");
    // Idempotent: a second pay returns the same payout.
    expect((await settle(api.pay("MINE"))).payout?.tx_hash).toBe(paid.payout?.tx_hash);
  });

  it("PHOT: the first pay fails with a ledger error and shows a failed row, the retry pays", async () => {
    const api = createFixtureApiClient();
    expect((await settle(api.getClaim("PHOT"))).state).toBe("paying");

    await expect(settle(api.pay("PHOT"))).rejects.toMatchObject({
      status: 502,
      code: "ledger_error",
    });
    const failed = await settle(api.getClaim("PHOT"));
    expect(failed.transactions.at(-1)).toMatchObject({
      kind: "helper_payout_offer",
      status: "failed",
    });

    expect((await settle(api.pay("PHOT"))).state).toBe("paid");
  });

  it("PAYG: pays about 4 seconds after the first load, the rows validating one by one", async () => {
    const api = createFixtureApiClient();
    const first = await settle(api.getClaim("PAYG"));
    expect(first.state).toBe("paying");

    vi.setSystemTime(Date.parse("2026-10-11T19:00:00.000Z") + 500);
    const pending = await settle(createFixtureApiClient().getClaim("PAYG"));
    expect(pending.transactions.at(-1)).toMatchObject({
      kind: "helper_payout_offer",
      status: "pending",
    });

    expect((await settle(api.getClaim("PAYG"))).state).toBe("paid");
  });

  it("refuses pay in PIN mode, and before the photo", async () => {
    const api = createFixtureApiClient();
    await expect(settle(api.pay("PINS"))).rejects.toMatchObject({ status: 409, code: "conflict" });
    await settle(api.claimSubtask("RACE")).catch(() => undefined);
    const fresh = createFixtureApiClient();
    await settle(fresh.claimSubtask("OPEN"));
    await expect(settle(fresh.pay("OPEN"))).rejects.toMatchObject({ code: "conflict" });
  });

  it("PINS: PIN mode walks claim, photo, PIN, paying, paid", async () => {
    const api = createFixtureApiClient();
    const start = await settle(api.getClaim("PINS"));
    expect(start).toMatchObject({ proof: "pin", state: "claimed_by_you" });
    expect(start.nft?.holder).toBe("you");

    const withPhoto = await settle(api.uploadPhoto("PINS", new Blob(["x"]), "Front table"));
    expect(withPhoto.state).toBe("claimed_by_you");
    expect(withPhoto.photo?.note).toBe("Front table");
    const wrong = await settle(api.submitPin("PINS", "0000"));
    expect(wrong.result).toBe("wrong");
    expect(wrong.claim.pin_attempts_left).toBe(2);
    const right = await settle(api.submitPin("PINS", FIXTURE_PIN));
    expect(right.claim.state).toBe("paying");
    expect(right.claim.payout?.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(5000);
    expect((await settle(api.getClaim("PINS"))).state).toBe("paid");
  });

  it("refuses a PIN in photo mode", async () => {
    const api = createFixtureApiClient();
    await expect(settle(api.submitPin("MINE", FIXTURE_PIN))).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("shows who holds each code's NFT", async () => {
    const api = createFixtureApiClient();
    const holder = async (code: string) => (await settle(api.getClaim(code))).nft?.holder;

    expect(await holder("TAKN")).toBe("helper");
    expect(await holder("EXPD")).toBe("burned");
    expect(await holder("PAID")).toBe("burned");
    expect(await holder("LOCK")).toBe("you");
  });

  it("locks after three wrong PINs", async () => {
    const api = createFixtureApiClient();
    await settle(api.submitPin("PINS", "0000"));
    await settle(api.submitPin("PINS", "1111"));
    const third = await settle(api.submitPin("PINS", "2222"));

    expect(third.result).toBe("locked");
    expect(third.claim.state).toBe("locked");
  });

  it("refuses a claim that someone else already has", async () => {
    const api = createFixtureApiClient();
    await expect(settle(api.claimSubtask("TAKN"))).rejects.toMatchObject({
      status: 409,
      code: "already_claimed",
    });
  });

  it("takes about one ledger close to claim, so the page shows its claiming state", async () => {
    const api = createFixtureApiClient();
    let done = false;
    void api.claimSubtask("OPEN").then(() => (done = true));

    await vi.advanceTimersByTimeAsync(3000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(done).toBe(true);
  });

  it("RACE: another phone wins while this one taps Claim", async () => {
    const api = createFixtureApiClient();
    expect((await settle(api.getClaim("RACE"))).state).toBe("open");
    await expect(settle(api.claimSubtask("RACE"))).rejects.toMatchObject({
      status: 409,
      code: "already_claimed",
    });
    expect((await settle(api.getClaim("RACE"))).state).toBe("already_claimed");
  });

  it("FLAK: the first claim response is lost but the claim went through", async () => {
    const api = createFixtureApiClient();
    await expect(settle(api.claimSubtask("FLAK"))).rejects.toBeInstanceOf(TypeError);
    expect((await settle(api.getClaim("FLAK"))).state).toBe("claimed_by_you");
  });

  it("FLAK: the first photo upload fails part way, the retry works", async () => {
    const api = createFixtureApiClient();
    await settle(api.claimSubtask("FLAK")).catch(() => undefined);
    const progress: number[] = [];

    await expect(
      settle(api.uploadPhoto("FLAK", new Blob(["x"]), "", { onProgress: (p) => progress.push(p) })),
    ).rejects.toBeInstanceOf(TypeError);
    expect(Math.max(...progress)).toBeLessThan(1);

    expect((await settle(api.uploadPhoto("FLAK", new Blob(["x"]), "Left side"))).photo?.note).toBe(
      "Left side",
    );
  });

  it("reports upload progress up to 1 and can be cancelled", async () => {
    const api = createFixtureApiClient();
    const progress: number[] = [];
    await settle(
      api.uploadPhoto("PINS", new Blob(["x"]), "", { onProgress: (p) => progress.push(p) }),
    );
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));

    const controller = new AbortController();
    const upload = settle(
      api.uploadPhoto("PINS", new Blob(["x"]), "", { signal: controller.signal }),
    );
    controller.abort();
    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
  });

  it("SOON: an open sub-task expires when its deadline passes", async () => {
    const api = createFixtureApiClient();
    expect((await settle(api.getClaim("SOON"))).state).toBe("open");
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await settle(api.getClaim("SOON"))).state).toBe("expired");
    await expect(settle(api.claimSubtask("SOON"))).rejects.toMatchObject({
      status: 410,
      code: "expired",
    });
  });

  describe("listOpenSubtasks (DRAFT GET /subtasks/open)", () => {
    const listedCodes = async (api: ReturnType<typeof createFixtureApiClient>) =>
      (await settle(api.listOpenSubtasks())).subtasks.map((s) => s.claim_code).sort();

    it("lists every fixture claim code that starts open, with the server's time", async () => {
      const api = createFixtureApiClient();
      const list = await settle(api.listOpenSubtasks());

      expect(list.server_time).toBe("2026-10-11T19:00:00.000Z");
      expect(list.subtasks.map((s) => s.claim_code).sort()).toEqual([
        "FLAK",
        "OPEN",
        "RACE",
        "SOON",
      ]);
    });

    it("lists only codes whose claim page opens in the open state", async () => {
      const api = createFixtureApiClient();
      const codes = (await settle(api.listOpenSubtasks())).subtasks.map((s) => s.claim_code);
      const claims = await settle(Promise.all(codes.map((code) => api.getClaim(code))));

      expect(claims.map((c) => [c.code, c.state])).toEqual(codes.map((code) => [code, "open"]));
    });

    it("shows the same pay, place and deadline as the claim page", async () => {
      const api = createFixtureApiClient();
      const open = (await settle(api.listOpenSubtasks())).subtasks.find(
        (s) => s.claim_code === "OPEN",
      );
      const claim = await settle(api.getClaim("OPEN"));

      expect(open).toMatchObject({
        price: "3.5",
        place: "Main Stacks, level C",
        deadline_at: "2026-10-11T19:12:00.000Z",
      });
      expect(open).toMatchObject({
        price: claim.subtask.price,
        description: claim.subtask.description,
        place: claim.subtask.place,
        time_limit_minutes: claim.subtask.time_limit_minutes,
        deadline_at: claim.subtask.deadline_at,
      });
    });

    it("gives each item a created_at before its deadline", async () => {
      const api = createFixtureApiClient();
      for (const s of (await settle(api.listOpenSubtasks())).subtasks) {
        expect(Date.parse(s.created_at), s.claim_code).toBeLessThan(Date.parse(s.deadline_at));
        expect(Date.parse(s.created_at), s.claim_code).toBeLessThanOrEqual(
          Date.parse("2026-10-11T19:00:00.000Z"),
        );
      }
    });

    it("drops a sub-task once this phone claims it, or another phone wins it", async () => {
      const api = createFixtureApiClient();
      await settle(api.claimSubtask("OPEN"));
      await settle(api.claimSubtask("RACE")).catch(() => undefined);

      expect(await listedCodes(api)).toEqual(["FLAK", "SOON"]);
    });

    it("drops SOON when its deadline passes, 20 seconds after it is first seen", async () => {
      const api = createFixtureApiClient();
      expect(await listedCodes(api)).toContain("SOON");
      await vi.advanceTimersByTimeAsync(20_000);

      expect(await listedCodes(api)).not.toContain("SOON");
    });

    it("returns an empty list when the empty state is asked for", async () => {
      const api = createFixtureApiClient(Date.now, { emptyOpenSubtasks: () => true });

      expect((await settle(api.listOpenSubtasks())).subtasks).toEqual([]);
    });

    it("asks for the empty state with ?fixtures=empty on the page URL", async () => {
      vi.stubGlobal("window", { location: { search: "?fixtures=empty" } });
      try {
        expect((await settle(createFixtureApiClient().listOpenSubtasks())).subtasks).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
      vi.stubGlobal("window", { location: { search: "?other=1" } });
      try {
        expect((await settle(createFixtureApiClient().listOpenSubtasks())).subtasks).not.toEqual(
          [],
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("PAID points at the helper payout transaction shown on the board", async () => {
    const api = createFixtureApiClient();
    const board = await settle(api.getBoardState());
    const sub = board.subtasks.find((s) => s.claim_code === "PAID");
    const payoutTx = board.txs.find(
      (tx) => tx.kind === "helper_payout" && tx.subtask_id === sub?.id,
    );

    const claim = await settle(api.getClaim("PAID"));

    expect(payoutTx).toBeDefined();
    expect(claim.payout).toMatchObject({
      amount: sub?.price,
      tx_hash: payoutTx?.hash,
      status: "validated",
    });
    expect(claim.transactions.find((tx) => tx.kind === "helper_payout")?.hash).toBe(payoutTx?.hash);
  });
});
