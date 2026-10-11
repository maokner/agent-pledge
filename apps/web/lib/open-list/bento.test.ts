import type { OpenSubtaskSummary } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import { bentoCells } from "./bento";

const NOW = Date.parse("2026-10-11T19:00:00.000Z");

function item(claim_code: string, price: string, minutesLeft: number): OpenSubtaskSummary {
  return {
    claim_code,
    price,
    description: "Save a seat",
    place: "Main Stacks",
    time_limit_minutes: 30,
    created_at: "2026-10-11T18:40:00.000Z",
    deadline_at: new Date(NOW + minutesLeft * 60_000).toISOString(),
  };
}

const codes = (subtasks: readonly OpenSubtaskSummary[]) => bentoCells(subtasks, NOW).map((cell) => cell.subtask.claim_code);

describe("bentoCells", () => {
  it("features the highest-paying sub-task, then the rest soonest deadline first", () => {
    const cells = bentoCells([item("SOON", "3", 1), item("RICH", "8", 20), item("MIDL", "6", 5), item("LATE", "4", 9)], NOW);
    expect(cells.map((c) => c.subtask.claim_code)).toEqual(["RICH", "SOON", "MIDL", "LATE"]);
    expect(cells.map((c) => c.featured)).toEqual([true, false, false, false]);
  });

  it("compares pay as money, not as text", () => {
    expect(codes([item("NINE", "9", 5), item("TWLV", "12.5", 9)])[0]).toBe("TWLV");
  });

  it("breaks a tie for top pay by the sooner deadline", () => {
    expect(codes([item("LATE", "8", 9), item("SOON", "8.00", 2), item("LOW1", "3", 1)])).toEqual(["SOON", "LOW1", "LATE"]);
  });

  it("leaves out sub-tasks whose time is up, even the best paid", () => {
    expect(codes([item("GONE", "20", 0), item("OPEN", "4", 5)])).toEqual(["OPEN"]);
  });

  it("never features a sub-task with a malformed pay over a real one", () => {
    expect(codes([item("ODD1", "lots", 9), item("REAL", "2", 5)])).toEqual(["REAL", "ODD1"]);
  });

  it("returns no cells when nothing is open", () => {
    expect(bentoCells([], NOW)).toEqual([]);
  });
});

describe("bentoCells spans (md: 2 columns, lg: 3 columns)", () => {
  const spans = (count: number) =>
    bentoCells(
      Array.from({ length: count }, (_, i) => item(`C${i}`, String(10 - i), i + 1)),
      NOW,
    ).map(({ md, lg, lgRows }) => `${md}/${lg}x${lgRows}`);

  it("lets one sub-task fill the whole row", () => {
    expect(spans(1)).toEqual(["2/3x1"]);
  });

  it("puts a second sub-task beside a wide, one-row featured card", () => {
    expect(spans(2)).toEqual(["2/2x1", "2/1x1"]);
  });

  it("stacks two small cards beside a tall featured card", () => {
    expect(spans(3)).toEqual(["2/2x2", "1/1x1", "1/1x1"]);
  });

  it("stretches the last card of a short bottom row so no row has a hole", () => {
    expect(spans(4)).toEqual(["2/2x2", "1/1x1", "1/1x1", "2/3x1"]);
    expect(spans(5)).toEqual(["2/2x2", "1/1x1", "1/1x1", "1/1x1", "1/2x1"]);
    expect(spans(6)).toEqual(["2/2x2", "1/1x1", "1/1x1", "1/1x1", "1/1x1", "2/1x1"]);
  });
});
