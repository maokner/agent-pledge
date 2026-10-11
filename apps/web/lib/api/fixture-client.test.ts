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
});
