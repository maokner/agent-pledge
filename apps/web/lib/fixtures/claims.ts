/**
 * Fixture claim codes. Open /c/<code> in fixture mode to see each claim state.
 * Codes that also appear on the fixture board use that sub-task's data.
 */
import {
  MAX_PIN_ATTEMPTS,
  type ClaimState,
  type ClaimView,
  type OpenSubtaskSummary,
  type ProofMode,
  type Subtask,
} from "@/lib/contract";
import { explorerTxUrl } from "../format";
import { buildFixtureSnapshot } from "./board";
import {
  addClaim,
  addOpening,
  addPayout,
  addRefund,
  fixtureSha256,
  ledgerFields,
  newLedger,
  type FixtureLedger,
} from "./claim-ledger";
import { FIXTURE_ERRANDS } from "./tasks";

/** The requester's PIN for every fixture sub-task. */
export const FIXTURE_PIN = "4821";

/**
 * Code -> the state /c/<code> starts in. Every code is in photo mode (the
 * photo pays) except PINS and LOCK, which are in PIN mode.
 */
export const FIXTURE_CLAIM_CODES = {
  OPEN: "open", // on the board as tsk_posted's sub-task; the photo pays at once (the photo call carries the payout)
  MINE: "claimed_by_you", // claimed on this phone, no photo yet; the photo call answers without a payout, so the page calls pay
  PHOT: "paying", // photo sent (tsk_seat), the payout did not go through: the page calls pay, the first try fails
  TAKN: "already_claimed",
  EXPD: "expired", // tsk_failed's sub-task: refunded and burned
  LOCK: "locked", // PIN mode, three wrong PINs
  PAYG: "paying", // photo sent, payout on its way: paid about 4 seconds after the first load
  PAID: "paid", // tsk_paid's sub-task
  RACE: "open", // tapping Claim loses to another phone (409)
  FLAK: "open", // bad signal: the first claim response is lost (the claim went through), the first photo upload fails
  SOON: "open", // 20 seconds left, then expired
  PINS: "claimed_by_you", // PIN mode: claimed on this phone, no photo yet (photo optional, then the PIN)
} as const satisfies Record<string, ClaimState>;

/** The codes in PIN mode; the rest are in photo mode. */
const PIN_MODE_CODES: ReadonlySet<string> = new Set<FixtureClaimCode>(["PINS", "LOCK"]);

/** A fixture claim: the view (without its ledger fields brought up to date) and its ledger. */
export interface FixtureClaim {
  view: ClaimView;
  ledger: FixtureLedger;
}

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

const SEAT_PHOTO = "/fixtures/seat-photo.svg";
const MIN = 60_000;

export function buildFixtureClaim(code: string, now: number): FixtureClaim | null {
  if (!isFixtureClaimCode(code)) return null;
  const snapshot = buildFixtureSnapshot(now);
  const sub = snapshot.subtasks.find((s) => s.claim_code === code);
  const state = FIXTURE_CLAIM_CODES[code];
  const details = FIXTURE_CLAIM_DETAILS[code] ?? DEFAULT_DETAILS;
  const price = sub?.price ?? details.price;
  const proof: ProofMode = PIN_MODE_CODES.has(code) ? "pin" : "photo";
  const ledger = newLedger(code, price, { takenByOther: code === "TAKN" });
  addOpening(ledger, now - 4 * MIN);
  const seatPhoto = (note: string | null = "Front table, left side") => ({
    url: SEAT_PHOTO,
    note,
    added_at: new Date(now - MIN).toISOString(),
  });
  let view: ClaimView = {
    code,
    state,
    subtask: sub
      ? pick(sub)
      : {
          description: details.description,
          place: details.place,
          time_limit_minutes: 10,
          deadline_at: new Date(now + 8 * MIN).toISOString(),
          price,
        },
    photo: sub?.photo ?? null,
    pin_attempts_left: sub?.pin_attempts_left ?? MAX_PIN_ATTEMPTS,
    payout: null,
    server_time: new Date(now).toISOString(),
    proof,
    proof_sha256: null,
    nft: null,
    escrow: null,
    transactions: [],
  };

  switch (code) {
    case "SOON":
      view = {
        ...view,
        subtask: {
          ...view.subtask,
          time_limit_minutes: 3,
          deadline_at: new Date(now + 20_000).toISOString(),
        },
      };
      break;
    case "MINE":
    case "PINS":
    case "TAKN":
      addClaim(ledger, now - 2 * MIN);
      break;
    case "PHOT":
      addClaim(ledger, now - 3 * MIN);
      view = {
        ...view,
        photo: view.photo ?? seatPhoto(),
        pin_attempts_left: MAX_PIN_ATTEMPTS,
        proof_sha256: fixtureSha256(1),
      };
      break;
    case "LOCK":
      addClaim(ledger, now - 3 * MIN);
      view = { ...view, pin_attempts_left: 0, photo: seatPhoto() };
      break;
    case "EXPD":
      addRefund(ledger, now - 2 * MIN);
      break;
    case "PAYG":
      addClaim(ledger, now - 3 * MIN);
      // The payout started as the page opened.
      addPayout(ledger, now);
      view = { ...view, photo: seatPhoto(), proof_sha256: fixtureSha256(2) };
      break;
    case "PAID": {
      addClaim(ledger, now - 3 * MIN);
      // The same payout transaction as on the board.
      const boardPayout = snapshot.txs.find(
        (tx) => tx.kind === "helper_payout" && tx.subtask_id === sub?.id,
      );
      const payoutHash = addPayout(ledger, now - 2 * MIN, boardPayout?.hash).hash;
      view = {
        ...view,
        proof_sha256: fixtureSha256(3),
        payout: {
          amount: price,
          tx_hash: payoutHash,
          status: "validated",
          explorer_url: explorerTxUrl(payoutHash),
        },
      };
      break;
    }
  }
  return { view: { ...view, ...ledgerFields(ledger, now) }, ledger };
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
