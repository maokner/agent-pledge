import type { OpenSubtaskSummary } from "@agent-pledge/shared";
import { describe, expect, it } from "vitest";
import { arrivalAnnouncement } from "./announce";

function item(claim_code: string, description = "Save a seat", price = "4"): OpenSubtaskSummary {
  return {
    claim_code,
    price,
    description,
    place: "Main Stacks",
    time_limit_minutes: 10,
    created_at: "2026-10-11T18:50:00.000Z",
    deadline_at: "2026-10-11T19:00:00.000Z",
  };
}

describe("arrivalAnnouncement", () => {
  it("says nothing on the first load, when everything is new", () => {
    expect(arrivalAnnouncement(null, [item("OPEN"), item("RACE")])).toBeNull();
  });

  it("says nothing when no sub-task is new, even if some went away", () => {
    expect(arrivalAnnouncement(["OPEN", "RACE"], [item("RACE")])).toBeNull();
  });

  it("names one new sub-task by its pay and what to do", () => {
    expect(arrivalAnnouncement(["OPEN"], [item("OPEN"), item("NEW1", "Bring a cold beer to Memorial Glade", "4.8")])).toBe(
      "New sub-task: $4.80, Bring a cold beer to Memorial Glade",
    );
  });

  it("counts several new sub-tasks instead of reading them all", () => {
    expect(arrivalAnnouncement([], [item("NEW1"), item("NEW2"), item("NEW3")])).toBe("3 new sub-tasks");
  });
});
