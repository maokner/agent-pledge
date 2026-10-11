import { describe, expect, it } from "vitest";
import { NO_ARRIVALS, trackArrivals } from "./arrivals";

describe("trackArrivals", () => {
  it("flags nothing on first load: the tasks there when the board is ready are the baseline", () => {
    const first = trackArrivals(NO_ARRIVALS, ["a", "b"], true);
    expect([...first.arrived]).toEqual([]);
  });

  it("waits for the board to be ready before taking the baseline", () => {
    const loading = trackArrivals(NO_ARRIVALS, ["a"], false);
    const ready = trackArrivals(loading, ["a", "b"], true);
    expect([...ready.arrived]).toEqual([]);
  });

  it("flags a task that shows up after first load, and keeps it flagged", () => {
    const base = trackArrivals(NO_ARRIVALS, ["a"], true);
    const next = trackArrivals(base, ["c", "a"], true);
    expect([...next.arrived]).toEqual(["c"]);
    const later = trackArrivals(next, ["d", "c", "a"], true);
    expect([...later.arrived].sort()).toEqual(["c", "d"]);
  });

  it("returns the same value when no new task arrived, so React can skip the update", () => {
    const base = trackArrivals(NO_ARRIVALS, ["a", "b"], true);
    expect(trackArrivals(base, ["b", "a"], true)).toBe(base);
    expect(trackArrivals(NO_ARRIVALS, [], false)).toBe(NO_ARRIVALS);
  });
});
