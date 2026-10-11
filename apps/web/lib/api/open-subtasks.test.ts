import type { OpenSubtaskSummary } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import { openSubtasksToShow } from "./open-subtasks";

const NOW = Date.parse("2026-10-11T19:00:00.000Z");

function item(
  claim_code: string,
  deadline_at: string,
  created_at = "2026-10-11T18:50:00.000Z",
): OpenSubtaskSummary {
  return {
    claim_code,
    price: "4",
    description: "Save a seat",
    place: "Main Stacks",
    time_limit_minutes: 10,
    created_at,
    deadline_at,
  };
}

const codes = (list: OpenSubtaskSummary[]) => list.map((s) => s.claim_code);

describe("openSubtasksToShow", () => {
  it("puts the soonest deadline first", () => {
    const list = [
      item("LATE", "2026-10-11T19:20:00.000Z"),
      item("SOON", "2026-10-11T19:01:00.000Z"),
      item("MIDL", "2026-10-11T19:08:00.000Z"),
    ];
    expect(codes(openSubtasksToShow(list, NOW))).toEqual(["SOON", "MIDL", "LATE"]);
  });

  it("drops sub-tasks whose deadline has passed, including one ending right now", () => {
    const list = [
      item("GONE", "2026-10-11T18:59:59.000Z"),
      item("EDGE", "2026-10-11T19:00:00.000Z"),
      item("OKAY", "2026-10-11T19:00:01.000Z"),
    ];
    expect(codes(openSubtasksToShow(list, NOW))).toEqual(["OKAY"]);
  });

  it("breaks a deadline tie by showing the newer sub-task first, then by claim code", () => {
    const deadline = "2026-10-11T19:10:00.000Z";
    const list = [
      item("BBBB", deadline, "2026-10-11T18:55:00.000Z"),
      item("OLD1", deadline, "2026-10-11T18:40:00.000Z"),
      item("AAAA", deadline, "2026-10-11T18:55:00.000Z"),
    ];
    expect(codes(openSubtasksToShow(list, NOW))).toEqual(["AAAA", "BBBB", "OLD1"]);
  });

  it("drops an item with an unreadable deadline instead of showing a broken countdown", () => {
    expect(openSubtasksToShow([item("BAD1", "not a date")], NOW)).toEqual([]);
  });

  it("does not change the list it was given", () => {
    const list = [
      item("LATE", "2026-10-11T19:20:00.000Z"),
      item("SOON", "2026-10-11T19:01:00.000Z"),
    ];
    openSubtasksToShow(list, NOW);
    expect(codes(list)).toEqual(["LATE", "SOON"]);
  });
});
