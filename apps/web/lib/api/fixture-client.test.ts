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
    await expect(settle(api.getClaim("ZZZZ"))).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("walks a helper from claim to paid", async () => {
    const api = createFixtureApiClient();

    expect((await settle(api.claimSubtask("OPEN"))).state).toBe("claimed_by_you");
    expect((await settle(api.uploadPhoto("OPEN", new Blob(["x"]), "Front table"))).photo?.note).toBe("Front table");
    const wrong = await settle(api.submitPin("OPEN", "0000"));
    expect(wrong.result).toBe("wrong");
    expect(wrong.claim.pin_attempts_left).toBe(2);
    expect((await settle(api.submitPin("OPEN", FIXTURE_PIN))).claim.state).toBe("paying");
    await vi.advanceTimersByTimeAsync(5000);
    expect((await settle(api.getClaim("OPEN"))).state).toBe("paid");
  });

  it("locks after three wrong PINs", async () => {
    const api = createFixtureApiClient();
    await settle(api.claimSubtask("MINE"));
    await settle(api.submitPin("MINE", "0000"));
    await settle(api.submitPin("MINE", "1111"));
    const third = await settle(api.submitPin("MINE", "2222"));

    expect(third.result).toBe("locked");
    expect(third.claim.state).toBe("locked");
  });

  it("refuses a claim that someone else already has", async () => {
    const api = createFixtureApiClient();
    await expect(settle(api.claimSubtask("TAKN"))).rejects.toMatchObject({ status: 409, code: "already_claimed" });
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
    await expect(settle(api.claimSubtask("RACE"))).rejects.toMatchObject({ status: 409, code: "already_claimed" });
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

    await expect(settle(api.uploadPhoto("FLAK", new Blob(["x"]), "", { onProgress: (p) => progress.push(p) }))).rejects.toBeInstanceOf(TypeError);
    expect(Math.max(...progress)).toBeLessThan(1);

    expect((await settle(api.uploadPhoto("FLAK", new Blob(["x"]), "Left side"))).photo?.note).toBe("Left side");
  });

  it("reports upload progress up to 1 and can be cancelled", async () => {
    const api = createFixtureApiClient();
    await settle(api.claimSubtask("MINE"));
    const progress: number[] = [];
    await settle(api.uploadPhoto("MINE", new Blob(["x"]), "", { onProgress: (p) => progress.push(p) }));
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));

    const controller = new AbortController();
    const upload = settle(api.uploadPhoto("MINE", new Blob(["x"]), "", { signal: controller.signal }));
    controller.abort();
    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
  });

  it("SOON: an open sub-task expires when its deadline passes", async () => {
    const api = createFixtureApiClient();
    expect((await settle(api.getClaim("SOON"))).state).toBe("open");
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await settle(api.getClaim("SOON"))).state).toBe("expired");
    await expect(settle(api.claimSubtask("SOON"))).rejects.toMatchObject({ status: 410, code: "expired" });
  });

  describe("listOpenSubtasks (DRAFT GET /subtasks/open)", () => {
    const listedCodes = async (api: ReturnType<typeof createFixtureApiClient>) =>
      (await settle(api.listOpenSubtasks())).subtasks.map((s) => s.claim_code).sort();

    it("lists every fixture claim code that starts open, with the server's time", async () => {
      const api = createFixtureApiClient();
      const list = await settle(api.listOpenSubtasks());

      expect(list.server_time).toBe("2026-10-11T19:00:00.000Z");
      expect(list.subtasks.map((s) => s.claim_code).sort()).toEqual(["FLAK", "OPEN", "RACE", "SOON"]);
    });

    it("lists only codes whose claim page opens in the open state", async () => {
      const api = createFixtureApiClient();
      const codes = (await settle(api.listOpenSubtasks())).subtasks.map((s) => s.claim_code);
      const claims = await settle(Promise.all(codes.map((code) => api.getClaim(code))));

      expect(claims.map((c) => [c.code, c.state])).toEqual(codes.map((code) => [code, "open"]));
    });

    it("shows the same pay, place and deadline as the claim page", async () => {
      const api = createFixtureApiClient();
      const open = (await settle(api.listOpenSubtasks())).subtasks.find((s) => s.claim_code === "OPEN");
      const claim = await settle(api.getClaim("OPEN"));

      expect(open).toMatchObject({ price: "3.5", place: "Main Stacks, level C", deadline_at: "2026-10-11T19:12:00.000Z" });
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
        expect(Date.parse(s.created_at), s.claim_code).toBeLessThanOrEqual(Date.parse("2026-10-11T19:00:00.000Z"));
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
        expect((await settle(createFixtureApiClient().listOpenSubtasks())).subtasks).not.toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("PAID points at the helper payout transaction shown on the board", async () => {
    const api = createFixtureApiClient();
    const board = await settle(api.getBoardState());
    const sub = board.subtasks.find((s) => s.claim_code === "PAID");
    const payoutTx = board.txs.find((tx) => tx.kind === "helper_payout" && tx.subtask_id === sub?.id);

    const claim = await settle(api.getClaim("PAID"));

    expect(payoutTx).toBeDefined();
    expect(claim.payout).toEqual({ amount: sub?.price, tx_hash: payoutTx?.hash, status: "validated" });
  });
});
