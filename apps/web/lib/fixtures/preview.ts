/**
 * Static board states for the fixture-only layout preview (/preview), so the
 * board can be checked with exactly one task, three tasks, or one task per
 * point in the flow, without waiting for the live fixture stream.
 */
import type { BoardState } from "../board/state";
import { foldEvents } from "./board";
import { ScenarioBuilder, seatHoldFlow, type FlowStop } from "./scenario";
import { FIXTURE_ERRANDS, LIVE_ERRAND_ROTATION } from "./tasks";

export const PREVIEW_LAYOUTS = {
  one: "One task, one sub-task",
  three: "Three tasks",
  stops: "Every point in the flow",
} as const;

export type PreviewLayout = keyof typeof PREVIEW_LAYOUTS;

const MIN = 60_000;

const DEMO = {
  timeLimitMinutes: 3,
  price: "5",
} as const;

export function buildPreviewState(layout: PreviewLayout, now: number): BoardState {
  const b = new ScenarioBuilder({ startSeq: 1, startTime: now - 20 * MIN, stepMs: 1000 });
  const stops: FlowStop[] =
    layout === "one"
      ? ["seat_saved"]
      : layout === "three"
        ? ["paid", "failed", "posted"]
        : ["paid", "failed", "seat_saved", "posted", "escrowed"];

  stops.forEach((stopAt, i) => {
    // Oldest first, so the newest (the last stop) is at the top of the board.
    b.at(now - (stops.length - i) * 2 * MIN);
    // "one" is the PRD's seat hold; the others show a mix of errands.
    const errand =
      FIXTURE_ERRANDS[
        layout === "one" ? "seat" : LIVE_ERRAND_ROTATION[i % LIVE_ERRAND_ROTATION.length]!
      ];
    seatHoldFlow(b, {
      ...DEMO,
      description: errand.description,
      subtaskDescription: errand.subtaskDescription,
      place: errand.place,
      photoUrl: errand.photoUrl,
      photoNote: errand.photoNote,
      taskId: `tsk_preview_${stopAt}`,
      subtaskId: `sub_preview_${stopAt}`,
      claimCode: `P${i}${stopAt.slice(0, 2).toUpperCase()}`.slice(0, 4),
      timeLimitMinutes: stopAt === "failed" ? 1 : layout === "one" ? DEMO.timeLimitMinutes : 10,
      stopAt,
    });
  });
  return foldEvents(b.events);
}
