/**
 * Fixture board data: a history with a task and a sub-task in every status,
 * and endless "live" runs for the simulated event stream.
 */
import type { BoardEvent, BoardSnapshot } from "@agent-pledge/shared";
import { applyBoardMessage, initialBoardState, type BoardState } from "../board/state";
import { ScenarioBuilder, seatHoldFlow } from "./scenario";

const MIN = 60_000;

/**
 * The events that happened before the page opened. Ends with:
 * - tsk_paid / sub_paid: done / done (claim code PAID)
 * - tsk_failed / sub_failed: failed / failed (claim code EXPD)
 * - tsk_seat / sub_seat: claimed / claimed, with a photo and one wrong PIN (claim code PHOT)
 * - tsk_posted / sub_posted: claimed / open, Yik Yak screenshot, NFT offer pending (claim code OPEN)
 * - tsk_open: open, task NFT mint pending
 */
export function buildFixtureHistory(now: number): BoardEvent[] {
  const b = new ScenarioBuilder({ startSeq: 1, startTime: now - 40 * MIN, stepMs: 1200 });

  seatHoldFlow(b, {
    taskId: "tsk_paid",
    subtaskId: "sub_paid",
    claimCode: "PAID",
    description: "Save me a seat at the front table",
    place: "Main Stacks, front table",
    timeLimitMinutes: 10,
    price: "5",
    stopAt: "paid",
  });

  b.at(now - 30 * MIN);
  seatHoldFlow(b, {
    taskId: "tsk_failed",
    subtaskId: "sub_failed",
    claimCode: "EXPD",
    description: "Save me a seat by the window",
    place: "Moffitt Library, 4th floor",
    timeLimitMinutes: 5,
    price: "3",
    stopAt: "failed",
  });

  b.at(now - 6 * MIN);
  seatHoldFlow(b, {
    taskId: "tsk_seat",
    subtaskId: "sub_seat",
    claimCode: "PHOT",
    description: "Save me a seat near an outlet",
    place: "Doe Library, North Reading Room",
    timeLimitMinutes: 20,
    price: "6",
    stopAt: "seat_saved",
    photoNote: "Third table, next to the outlet",
  });

  b.at(now - 3 * MIN);
  seatHoldFlow(b, {
    taskId: "tsk_posted",
    subtaskId: "sub_posted",
    claimCode: "OPEN",
    description: "Save me a seat at the big table",
    place: "Main Stacks, level C",
    timeLimitMinutes: 15,
    price: "4.5",
    stopAt: "posted",
  });

  b.at(now - 20_000);
  seatHoldFlow(b, {
    taskId: "tsk_open",
    subtaskId: "sub_open",
    claimCode: "NEW1",
    description: "Save me two seats together",
    place: "Kresge Engineering Library",
    timeLimitMinutes: 30,
    price: "10",
    stopAt: "escrowed",
  });

  return b.events;
}

/**
 * One full live run after the history: even runs succeed, odd runs fail.
 * Event times start at `startTime` and step by `stepMs`.
 */
export function buildLiveRun(opts: { run: number; startSeq: number; startTime: number; stepMs: number }): BoardEvent[] {
  const b = new ScenarioBuilder({ startSeq: opts.startSeq, startTime: opts.startTime, stepMs: opts.stepMs });
  const success = opts.run % 2 === 0;
  seatHoldFlow(b, {
    taskId: `tsk_live${opts.run}`,
    subtaskId: `sub_live${opts.run}`,
    claimCode: `L${String(opts.run).padStart(3, "0")}`.slice(0, 4),
    description: success ? "Save me a seat at the front table" : "Save me a seat in the quiet room",
    place: success ? "Main Stacks, front table" : "Main Stacks, quiet room",
    timeLimitMinutes: success ? 3 : 1,
    price: success ? "5" : "2",
    stopAt: success ? "paid" : "failed",
  });
  return b.events;
}

/** The task from a create_task call (the backup form, #38), run through to payout. */
export function buildCreatedTaskRun(opts: {
  task: { task_id: string; description: string; place: string; time_limit_minutes: number; price_usd: number };
  claimCode: string;
  startSeq: number;
  startTime: number;
  stepMs: number;
}): BoardEvent[] {
  const { task } = opts;
  const b = new ScenarioBuilder({ startSeq: opts.startSeq, startTime: opts.startTime, stepMs: opts.stepMs });
  seatHoldFlow(b, {
    taskId: task.task_id,
    subtaskId: task.task_id.replace(/^tsk_/, "sub_"),
    claimCode: opts.claimCode,
    description: task.description,
    place: task.place,
    timeLimitMinutes: task.time_limit_minutes,
    price: String(task.price_usd),
    stopAt: "paid",
  });
  return b.events;
}

export function foldEvents(events: BoardEvent[], from: BoardState = initialBoardState): BoardState {
  return events.reduce(applyBoardMessage, from);
}

export function toSnapshot(state: BoardState, generatedAt: string): BoardSnapshot {
  return {
    seq: state.seq,
    generated_at: generatedAt,
    tasks: Object.values(state.tasks),
    subtasks: Object.values(state.subtasks),
    txs: Object.values(state.txs),
    agent_log: state.agentLog,
  };
}

export function buildFixtureSnapshot(now: number): BoardSnapshot {
  return toSnapshot(foldEvents(buildFixtureHistory(now)), new Date(now).toISOString());
}
