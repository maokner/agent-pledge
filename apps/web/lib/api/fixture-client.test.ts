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
  await vi.advanceTimersByTimeAsync(1000);
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
});
