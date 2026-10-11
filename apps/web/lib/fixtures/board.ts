/**
 * Fixture board data: a history with a task and a sub-task in every status,
 * and endless "live" runs for the simulated event stream.
 */
import type { BoardEvent, BoardSnapshot } from "@/lib/contract";
import { applyBoardMessage, initialBoardState, type BoardState } from "../board/state";
import { ScenarioBuilder, seatHoldFlow } from "./scenario";
import { FIXTURE_ERRANDS, LIVE_ERRAND_ROTATION, type FixtureErrandName } from "./tasks";

const MIN = 60_000;

/**
 * The events that happened before the page opened. Ends with:
 * - tsk_paid / sub_paid: done / done, a beer delivered (claim code PAID)
 * - tsk_failed / sub_failed: failed / failed, a design choice nobody took (claim code EXPD)
 * - tsk_seat / sub_seat: claimed / claimed, an essay edit with a photo and one wrong PIN (claim code PHOT)
 * - tsk_posted / sub_posted: claimed / open, a seat hold with a Yik Yak screenshot, NFT offer pending (claim code OPEN)
 * - tsk_open: open, two seats, task NFT mint pending
 */
export function buildFixtureHistory(now: number): BoardEvent[] {
  const b = new ScenarioBuilder({ startSeq: 1, startTime: now - 40 * MIN, stepMs: 1200 });

  seatHoldFlow(b, {
    taskId: "tsk_paid",
    subtaskId: "sub_paid",
    claimCode: "PAID",
    ...errand("beer"),
    timeLimitMinutes: 10,
    price: "5",
    stopAt: "paid",
  });

  b.at(now - 30 * MIN);
  seatHoldFlow(b, {
    taskId: "tsk_failed",
    subtaskId: "sub_failed",
    claimCode: "EXPD",
    ...errand("design"),
    timeLimitMinutes: 5,
    price: "3",
    stopAt: "failed",
  });

  b.at(now - 6 * MIN);
  seatHoldFlow(b, {
    taskId: "tsk_seat",
    subtaskId: "sub_seat",
    claimCode: "PHOT",
    ...errand("essay"),
    timeLimitMinutes: 20,
    price: "6",
    stopAt: "seat_saved",
  });

  b.at(now - 3 * MIN);
  seatHoldFlow(b, {
    taskId: "tsk_posted",
    subtaskId: "sub_posted",
    claimCode: "OPEN",
    ...errand("seat"),
    timeLimitMinutes: 15,
    price: "4.5",
    stopAt: "posted",
  });

  b.at(now - 20_000);
  seatHoldFlow(b, {
    taskId: "tsk_open",
    subtaskId: "sub_open",
    claimCode: "NEW1",
    ...errand("twoSeats"),
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
export function buildLiveRun(opts: {
  run: number;
  startSeq: number;
  startTime: number;
  stepMs: number;
}): BoardEvent[] {
  const b = new ScenarioBuilder({
    startSeq: opts.startSeq,
    startTime: opts.startTime,
    stepMs: opts.stepMs,
  });
  const success = opts.run % 2 === 0;
  seatHoldFlow(b, {
    taskId: `tsk_live${opts.run}`,
    subtaskId: `sub_live${opts.run}`,
    claimCode: `L${String(opts.run).padStart(3, "0")}`.slice(0, 4),
    ...errand(LIVE_ERRAND_ROTATION[opts.run % LIVE_ERRAND_ROTATION.length]!),
    timeLimitMinutes: success ? 3 : 1,
    price: success ? "5" : "2",
    stopAt: success ? "paid" : "failed",
  });
  return b.events;
}

/** The task from a create_task call (the backup form, #38), run through to payout. */
export function buildCreatedTaskRun(opts: {
  task: {
    task_id: string;
    description: string;
    place: string;
    time_limit_minutes: number;
    price_usd: number;
  };
  claimCode: string;
  startSeq: number;
  startTime: number;
  stepMs: number;
}): BoardEvent[] {
  const { task } = opts;
  const b = new ScenarioBuilder({
    startSeq: opts.startSeq,
    startTime: opts.startTime,
    stepMs: opts.stepMs,
  });
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

/** A fixture errand's text and proof, in the shape the scenario builder takes. */
function errand(name: FixtureErrandName) {
  const { description, subtaskDescription, place, photoUrl, photoNote } = FIXTURE_ERRANDS[name];
  return { description, subtaskDescription, place, photoUrl, photoNote };
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
