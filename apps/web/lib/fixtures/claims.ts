/**
 * Fixture claim codes. Open /c/<code> in fixture mode to see each claim state.
 * Codes that also appear on the fixture board use that sub-task's data.
 */
import {
  MAX_PIN_ATTEMPTS,
  type ClaimState,
  type ClaimView,
  type OpenSubtaskSummary,
  type Subtask,
} from "@/lib/contract";
import { buildFixtureSnapshot } from "./board";
import { fakeHex } from "./factories";
import { FIXTURE_ERRANDS } from "./tasks";

/** The requester's PIN for every fixture sub-task. */
export const FIXTURE_PIN = "4821";

/** Code -> the state /c/<code> starts in. */
export const FIXTURE_CLAIM_CODES = {
  OPEN: "open", // on the board as tsk_posted's sub-task
  MINE: "claimed_by_you", // claimed on this phone, no photo yet
  PHOT: "claimed_by_you", // claimed on this phone, photo added, one wrong PIN (tsk_seat)
  TAKN: "already_claimed",
  EXPD: "expired", // tsk_failed's sub-task
  LOCK: "locked",
  PAYG: "paying", // turns into "paid" a few seconds after the first load
  PAID: "paid", // tsk_paid's sub-task
  RACE: "open", // tapping Claim loses to another phone (409)
  FLAK: "open", // bad signal: the first claim response is lost (the claim went through), the first photo upload fails
  SOON: "open", // 20 seconds left, then expired
} as const satisfies Record<string, ClaimState>;

export type FixtureClaimCode = keyof typeof FIXTURE_CLAIM_CODES;

export function isFixtureClaimCode(code: string): code is FixtureClaimCode {
  return Object.hasOwn(FIXTURE_CLAIM_CODES, code);
}

/** The codes that start open: what the /human list shows in fixture mode (OPEN, RACE, FLAK, SOON). */
export const OPEN_FIXTURE_CLAIM_CODES = (
  Object.keys(FIXTURE_CLAIM_CODES) as FixtureClaimCode[]
).filter((code) => FIXTURE_CLAIM_CODES[code] === "open");

/**
 * What each code not on the fixture board asks for, so the /human list has
 * different items. Codes not listed here use DEFAULT_DETAILS.
 */
const DEFAULT_DETAILS = {
  description: "Save a seat at the front table",
  place: "Main Stacks, front table",
  price: "4",
};
const FIXTURE_CLAIM_DETAILS: Partial<Record<FixtureClaimCode, typeof DEFAULT_DETAILS>> = {
  MINE: {
    description: FIXTURE_ERRANDS.beer.subtaskDescription,
    place: FIXTURE_ERRANDS.beer.place,
    price: "4",
  },
  RACE: {
    description: FIXTURE_ERRANDS.design.subtaskDescription,
    place: FIXTURE_ERRANDS.design.place,
    price: "6",
  },
  FLAK: {
    description: FIXTURE_ERRANDS.essay.subtaskDescription,
    place: FIXTURE_ERRANDS.essay.place,
    price: "8",
  },
  SOON: {
    description: FIXTURE_ERRANDS.beer.subtaskDescription,
    place: FIXTURE_ERRANDS.beer.place,
    price: "3",
  },
};
/**
 * A claim view as an item in the open sub-task list (DRAFT GET /subtasks/open).
 * ClaimView has no created_at, so it is the deadline minus the time limit.
 */
export function toOpenSubtaskSummary(view: ClaimView): OpenSubtaskSummary {
  const { description, place, price, time_limit_minutes, deadline_at } = view.subtask;
  const created_at = new Date(Date.parse(deadline_at) - time_limit_minutes * 60_000).toISOString();
  return {
    claim_code: view.code,
    price,
    description,
    place,
    time_limit_minutes,
    created_at,
    deadline_at,
  };
}

export function buildFixtureClaim(code: string, now: number): ClaimView | null {
  if (!isFixtureClaimCode(code)) return null;
  const snapshot = buildFixtureSnapshot(now);
  const sub = snapshot.subtasks.find((s) => s.claim_code === code);
  const state = FIXTURE_CLAIM_CODES[code];
  const details = FIXTURE_CLAIM_DETAILS[code] ?? DEFAULT_DETAILS;
  const price = sub?.price ?? details.price;
  const view: ClaimView = {
    code,
    state,
    subtask: sub
      ? pick(sub)
      : {
          description: details.description,
          place: details.place,
          time_limit_minutes: 10,
          deadline_at: new Date(now + 8 * 60_000).toISOString(),
          price,
        },
    photo: sub?.photo ?? null,
    pin_attempts_left: sub?.pin_attempts_left ?? MAX_PIN_ATTEMPTS,
    payout: null,
    server_time: new Date(now).toISOString(),
  };

  switch (code) {
    case "SOON":
      return {
        ...view,
        subtask: {
          ...view.subtask,
          time_limit_minutes: 3,
          deadline_at: new Date(now + 20_000).toISOString(),
        },
      };
    case "LOCK":
      return {
        ...view,
        pin_attempts_left: 0,
        photo: {
          url: "/fixtures/seat-photo.svg",
          note: "Front table, left side",
          added_at: view.server_time,
        },
      };
    case "PAYG":
      return {
        ...view,
        photo: {
          url: "/fixtures/seat-photo.svg",
          note: "Front table, left side",
          added_at: view.server_time,
        },
        payout: { amount: price, tx_hash: fakeHex(9001), status: "pending" },
      };
    case "PAID": {
      const payout = snapshot.txs.find(
        (tx) => tx.kind === "helper_payout" && tx.subtask_id === sub?.id,
      );
      return {
        ...view,
        payout: { amount: price, tx_hash: payout?.hash ?? fakeHex(9002), status: "validated" },
      };
    }
    default:
      return view;
  }
}

function pick(sub: Subtask): ClaimView["subtask"] {
  return {
    description: sub.description,
    place: sub.place,
    time_limit_minutes: sub.time_limit_minutes,
    deadline_at: sub.deadline_at,
    price: sub.price,
  };
}
