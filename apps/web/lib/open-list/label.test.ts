import type { OpenSubtaskSummary } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import { openSubtaskLabel } from "./label";

const BEER: OpenSubtaskSummary = {
  claim_code: "OPEN",
  price: "4.8",
  description: "Bring a cold beer to Memorial Glade",
  place: "Memorial Glade by the big oak",
  time_limit_minutes: 10,
  created_at: "2026-10-11T18:50:00.000Z",
  deadline_at: "2026-10-11T19:00:00.000Z",
};

describe("openSubtaskLabel", () => {
  it("reads pay, what to do, place and minutes left, in that order", () => {
    expect(openSubtaskLabel(BEER, 3 * 60_000 + 20_000)).toBe(
      "$4.80, Bring a cold beer to Memorial Glade, Memorial Glade by the big oak, 3 minutes left",
    );
  });

  it("says one minute in the singular", () => {
    expect(openSubtaskLabel(BEER, 90_000)).toMatch(/, 1 minute left$/);
  });

  it("says under a minute when the seconds are running out", () => {
    expect(openSubtaskLabel(BEER, 59_000)).toMatch(/, under a minute left$/);
  });

  it("gives hours and minutes for a long time limit", () => {
    expect(openSubtaskLabel(BEER, 65 * 60_000)).toMatch(/, 1 hour 5 minutes left$/);
    expect(openSubtaskLabel(BEER, 2 * 60 * 60_000)).toMatch(/, 2 hours left$/);
  });
});
