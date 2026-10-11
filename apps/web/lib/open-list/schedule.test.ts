import { describe, expect, it } from "vitest";
import { INITIAL_OPEN_LIST, type OpenListState } from "./feed";
import { planFetch, POLL_MS } from "./schedule";

function ready(failures = 0): OpenListState {
  return { status: "ready", subtasks: [], offsetMs: 0, failures, entering: [], announcement: null };
}

const VISIBLE = { visible: true, inFlight: false };

describe("planFetch", () => {
  it("polls every 10 to 15 seconds while the list is fresh and the tab is visible", () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(10_000);
    expect(POLL_MS).toBeLessThanOrEqual(15_000);
    expect(planFetch(ready(), { ...VISIBLE, trigger: "settled" })).toEqual({
      kind: "after",
      ms: POLL_MS,
    });
  });

  it("does not poll while the tab is hidden", () => {
    for (const trigger of ["start", "settled", "shown", "online"] as const) {
      expect(planFetch(ready(), { visible: false, inFlight: false, trigger }), trigger).toEqual({
        kind: "none",
      });
    }
  });

  it("fetches at once on the first load, when the tab is shown again and when the phone is back online", () => {
    expect(planFetch(INITIAL_OPEN_LIST, { ...VISIBLE, trigger: "start" })).toEqual({ kind: "now" });
    expect(planFetch(ready(), { ...VISIBLE, trigger: "shown" })).toEqual({ kind: "now" });
    expect(planFetch(ready(3), { ...VISIBLE, trigger: "online" })).toEqual({ kind: "now" });
  });

  it("does not start a second fetch while one is on its way", () => {
    expect(planFetch(ready(), { visible: true, inFlight: true, trigger: "shown" })).toEqual({
      kind: "none",
    });
  });

  it("retries sooner after a failure, backing off up to the normal poll", () => {
    const delays = [1, 2, 3, 4, 5].map((failures) =>
      planFetch(ready(failures), { ...VISIBLE, trigger: "settled" }),
    );
    expect(delays).toEqual([
      { kind: "after", ms: 2000 },
      { kind: "after", ms: 4000 },
      { kind: "after", ms: 8000 },
      { kind: "after", ms: POLL_MS },
      { kind: "after", ms: POLL_MS },
    ]);
  });

  it("keeps retrying quietly after the first load failed", () => {
    expect(planFetch({ status: "error", failures: 1 }, { ...VISIBLE, trigger: "settled" })).toEqual(
      { kind: "after", ms: 2000 },
    );
  });
});
