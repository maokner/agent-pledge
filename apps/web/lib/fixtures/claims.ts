/**
 * Fixture claim codes. Open /c/<code> in fixture mode to see each claim state.
 * Codes that also appear on the fixture board use that sub-task's data.
 */
import { MAX_PIN_ATTEMPTS, type ClaimState, type ClaimView, type Subtask } from "@agent-pledge/shared";
import { buildFixtureSnapshot } from "./board";
import { fakeHex } from "./factories";

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
} as const satisfies Record<string, ClaimState>;

export type FixtureClaimCode = keyof typeof FIXTURE_CLAIM_CODES;

export function isFixtureClaimCode(code: string): code is FixtureClaimCode {
  return Object.hasOwn(FIXTURE_CLAIM_CODES, code);
}

export function buildFixtureClaim(code: string, now: number): ClaimView | null {
  if (!isFixtureClaimCode(code)) return null;
  const snapshot = buildFixtureSnapshot(now);
  const sub = snapshot.subtasks.find((s) => s.claim_code === code);
  const state = FIXTURE_CLAIM_CODES[code];
  const price = sub?.price ?? "4";
  const view: ClaimView = {
    code,
    state,
    subtask: sub
      ? pick(sub)
      : {
          description: "Save a seat at the front table",
          place: "Main Stacks, front table",
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
    case "LOCK":
      return {
        ...view,
        pin_attempts_left: 0,
        photo: { url: "/fixtures/seat-photo.svg", note: "Front table, left side", added_at: view.server_time },
      };
    case "PAYG":
      return {
        ...view,
        photo: { url: "/fixtures/seat-photo.svg", note: "Front table, left side", added_at: view.server_time },
        payout: { amount: price, tx_hash: fakeHex(9001), status: "pending" },
      };
    case "PAID": {
      const payout = snapshot.txs.find((tx) => tx.kind === "helper_payout" && tx.subtask_id === sub?.id);
      return { ...view, payout: { amount: price, tx_hash: payout?.hash ?? fakeHex(9002), status: "validated" } };
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
