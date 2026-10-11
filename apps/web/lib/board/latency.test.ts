import { describe, expect, it } from "vitest";
import { createLatencyTracker, R3_BUDGET_MS } from "./latency";

const T = Date.parse("2026-10-11T19:00:00.000Z");
const at = (ms: number) => new Date(T + ms).toISOString();

describe("createLatencyTracker", () => {
  it("measures an event from the server's time to the screen, split at the browser's receipt", () => {
    const tracker = createLatencyTracker();

    tracker.received({ seq: 7, at: at(0) }, T + 120);
    tracker.rendered(7, T + 150);

    expect(tracker.stats().last).toEqual({ seq: 7, transitMs: 120, renderMs: 30, totalMs: 150 });
  });

  it("finishes every event that the same render showed", () => {
    const tracker = createLatencyTracker();
    tracker.received({ seq: 1, at: at(0) }, T + 100);
    tracker.received({ seq: 2, at: at(50) }, T + 110);
    tracker.received({ seq: 3, at: at(60) }, T + 400);

    tracker.rendered(2, T + 130);

    expect(tracker.stats().count).toBe(2);
    expect(tracker.stats().worstTotalMs).toBe(130);
    tracker.rendered(3, T + 420);
    expect(tracker.stats().last?.seq).toBe(3);
    expect(tracker.stats().count).toBe(3);
  });

  it("counts events that took longer than the 2 second budget (PRD R3)", () => {
    const tracker = createLatencyTracker();
    tracker.received({ seq: 1, at: at(0) }, T + 1900);
    tracker.rendered(1, T + 1950);
    tracker.received({ seq: 2, at: at(0) }, T + 2500);
    tracker.rendered(2, T + 2600);

    expect(R3_BUDGET_MS).toBe(2000);
    expect(tracker.stats().overBudget).toBe(1);
  });

  it("reports the worst of the most recent events only", () => {
    const tracker = createLatencyTracker({ window: 2 });
    [900, 100, 200].forEach((total, i) => {
      tracker.received({ seq: i + 1, at: at(0) }, T + total);
      tracker.rendered(i + 1, T + total);
    });

    expect(tracker.stats().worstTotalMs).toBe(200);
    expect(tracker.stats().count).toBe(3);
  });

  it("has no numbers before the first render", () => {
    const tracker = createLatencyTracker();
    tracker.received({ seq: 1, at: at(0) }, T + 100);

    expect(tracker.stats()).toEqual({ last: null, count: 0, worstTotalMs: null, overBudget: 0 });
  });
});
