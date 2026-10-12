/**
 * ApiClient for fixture mode. Keeps claim state in memory for this tab, so
 * the claim page can be clicked through: claim -> photo -> paid (photo mode),
 * or claim -> photo (optional) -> PIN -> paid (PIN mode, the PINS code).
 * The PIN is FIXTURE_PIN ("4821"). Reload to reset.
 * Claims take about one ledger close, uploads report progress, the payout
 * takes about 4 seconds, and each claim's transactions show up and validate
 * as time passes. The MINE, PHOT, RACE, FLAK and SOON codes act out a photo
 * answer without a payout, a payout that fails once, a lost race, a bad signal
 * and a deadline.
 * listOpenSubtasks() lists the codes that start open; `?fixtures=empty` on the
 * page URL lists none.
 */
import { type ClaimView, type SubmitPinResponse } from "@/lib/contract";
import { buildFixtureSnapshot } from "../fixtures/board";
import {
  addClaim,
  addPayout,
  addTx,
  fixtureSha256,
  ledgerFields,
  paidTx,
  payoutLandsAt,
  PAYOUT_OFFER_MS,
} from "../fixtures/claim-ledger";
import {
  buildFixtureClaim,
  FIXTURE_PIN,
  OPEN_FIXTURE_CLAIM_CODES,
  toOpenSubtaskSummary,
  type FixtureClaim,
} from "../fixtures/claims";
import { explorerTxUrl } from "../format";
import { ApiError, type ApiClient, type UploadOptions } from "./client";

const LATENCY_MS = 300;
const CLAIM_MS = 5000; // the server creates a wallet and accepts the NFT offer: 4 to 8 seconds
const UPLOAD_MS = 1500;
const UPLOAD_TICKS = 10;

/** MINE: the photo call answers without a payout (as after a lost payout), so the page calls pay. */
const PHOTO_ANSWERS_WITHOUT_PAYOUT: ReadonlySet<string> = new Set(["MINE"]);
/** PHOT: how many pay calls fail with a ledger error before one works. */
const PAY_FAILURES: Readonly<Record<string, number>> = { PHOT: 1 };

export interface FixtureApiClientOptions {
  /**
   * True to list no open sub-tasks, for the /human empty state.
   * Default: the page URL has `?fixtures=empty` (for example `/human?fixtures=empty`).
   */
  emptyOpenSubtasks?: () => boolean;
}

/** `?fixtures=empty` on the page URL asks for the /human empty state in fixture mode. */
function emptyStateInUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("fixtures") === "empty";
}

export function createFixtureApiClient(
  now: () => number = Date.now,
  { emptyOpenSubtasks = emptyStateInUrl }: FixtureApiClientOptions = {},
): ApiClient {
  const claims = new Map<string, FixtureClaim>();
  /** "FLAK:claim", "FLAK:photo": the one-time failures that already happened. */
  const flaked = new Set<string>();
  const payFailures = new Map(Object.entries(PAY_FAILURES));
  /** Until when (epoch ms) a code's failing payout try is still going. */
  const failingUntil = new Map<string, number>();

  /** True the first time a FLAK action runs, so the page sees one failure, then success on retry. */
  function flakes(code: string, action: "claim" | "photo"): boolean {
    if (code !== "FLAK" || flaked.has(`${code}:${action}`)) return false;
    flaked.add(`${code}:${action}`);
    return true;
  }

  function entry(code: string): FixtureClaim {
    const found = claims.get(code) ?? buildFixtureClaim(code, now());
    if (!found) throw new ApiError(404, "not_found", "This claim link is not valid.");
    claims.set(code, found);
    return found;
  }

  /** The claim as the server would answer now: deadline, payout and ledger brought up to date. */
  function load(code: string): ClaimView {
    const { ledger } = entry(code);
    let view = entry(code).view;
    const t = now();
    const live = view.state === "open" || view.state === "claimed_by_you";
    if (live && Date.parse(view.subtask.deadline_at) <= t) view = { ...view, state: "expired" };
    if (view.state === "paying") {
      const paid = paidTx(ledger, t);
      if (paid) {
        view = {
          ...view,
          state: "paid",
          payout: {
            amount: view.subtask.price,
            tx_hash: paid.hash,
            status: "validated",
            explorer_url: explorerTxUrl(paid.hash),
          },
        };
      }
    }
    view = { ...view, ...ledgerFields(ledger, t), server_time: new Date(t).toISOString() };
    claims.set(code, { view, ledger });
    return view;
  }

  function save(view: ClaimView): ClaimView {
    const { ledger } = entry(view.code);
    const saved = { ...view, ...ledgerFields(ledger, now()) };
    claims.set(view.code, { view: saved, ledger });
    return saved;
  }

  function requireMine(view: ClaimView): void {
    if (view.state === "expired")
      throw new ApiError(410, "expired", "Time ran out for this sub-task.");
    if (view.state !== "claimed_by_you")
      throw new ApiError(403, "not_your_claim", "This phone did not claim this sub-task.");
  }

  /** Starts the payout now unless one is on its way; returns when it lands (epoch ms). */
  function startPayout(code: string): number {
    const { ledger } = entry(code);
    const landsAt = payoutLandsAt(ledger);
    if (landsAt !== null) return landsAt;
    addPayout(ledger, now());
    return payoutLandsAt(ledger) ?? now();
  }

  /** Waits until the payout lands, then answers with the paid claim. */
  async function untilPaid(code: string, landsAt: number): Promise<ClaimView> {
    await delay(null, Math.max(LATENCY_MS, landsAt - now() + 50));
    return load(code);
  }

  return {
    getBoardState: () => delay(buildFixtureSnapshot(now())),
    getTaskJson: async (id) => {
      const snap = buildFixtureSnapshot(now());
      const task = snap.tasks.find((t) => t.id === id);
      const sub = snap.subtasks.find((s) => s.id === id);
      const item = task ?? sub;
      if (!item) throw new ApiError(404, "not_found", "Unknown task.");
      const parent = sub ? snap.tasks.find((t) => t.id === sub.task_id) : undefined;
      return delay({
        id: item.id,
        type: sub ? "subtask" : "task",
        description: item.description,
        place: item.place,
        time_limit_minutes: item.time_limit_minutes,
        price: item.price,
        created_at: item.created_at,
        parent_task_id: sub?.task_id ?? null,
        parent_nft_id: parent?.nft_id ?? null,
        board_url: "/board",
      });
    },
    createTask: (request) => {
      console.info("[fixtures] create_task", request);
      return delay({ task_id: `tsk_form_${now()}`, pin: FIXTURE_PIN, board_url: "/board" });
    },

    getClaim: async (code) => delay(load(code)),
    claimSubtask: async (code) => {
      const view = load(code);
      const { ledger } = entry(code);
      if (code === "RACE" && view.state === "open") {
        // Another phone's claim lands first.
        ledger.takenByOther = true;
        addClaim(ledger, now(), CLAIM_MS - 1000);
        save({ ...view, state: "already_claimed" });
        return delayThenFail(
          new ApiError(409, "already_claimed", "Someone else claimed this first."),
          CLAIM_MS,
        );
      }
      if (view.state === "open") {
        addClaim(ledger, now(), CLAIM_MS - 500);
        save({ ...view, state: "claimed_by_you" });
        if (flakes(code, "claim")) return delayThenFail(new TypeError("Failed to fetch"), CLAIM_MS);
        await delay(null, CLAIM_MS);
        return load(code);
      }
      if (view.state === "already_claimed")
        throw new ApiError(409, "already_claimed", "Someone else claimed this first.");
      if (view.state === "expired")
        throw new ApiError(410, "expired", "Time ran out for this sub-task.");
      return delay(view);
    },
    uploadPhoto: async (code, photo, note, options) => {
      requireMine(load(code));
      await simulateUpload(options, flakes(code, "photo"));
      const view = load(code);
      requireMine(view);
      const url =
        typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(photo)
          : "/fixtures/seat-photo.svg";
      const withPhoto: ClaimView = {
        ...view,
        photo: { url, note: note || null, added_at: new Date(now()).toISOString() },
      };
      if (view.proof === "pin") return save(withPhoto);
      // Photo mode: the photo is the proof, and it pays.
      // A stand-in for the photo's sha256 (the real server hashes the stored file).
      save({ ...withPhoto, state: "paying", proof_sha256: fixtureSha256(photo.size + now()) });
      if (PHOTO_ANSWERS_WITHOUT_PAYOUT.has(code)) return load(code);
      return untilPaid(code, startPayout(code));
    },
    pay: async (code) => {
      const view = load(code);
      if (view.state === "paid") return delay(view);
      if (view.proof === "pin")
        return delayThenFail(
          new ApiError(409, "conflict", "This sub-task is paid when the PIN is right."),
        );
      if (view.state === "expired")
        throw new ApiError(410, "expired", "Time ran out for this sub-task.");
      if (view.state !== "paying")
        throw new ApiError(409, "conflict", "Send the photo first. The photo is what pays you.");
      // PHOT: the first payout try fails. Calls made while it is failing (a double call) fail with it.
      const failing = failingUntil.get(code);
      if (failing !== undefined && now() < failing) {
        return delayThenFail(ledgerError(), failing - now());
      }
      const failures = payFailures.get(code) ?? 0;
      if (failures > 0 && payoutLandsAt(entry(code).ledger) === null) {
        payFailures.set(code, failures - 1);
        failingUntil.set(code, now() + PAYOUT_OFFER_MS + 100);
        addTx(entry(code).ledger, "helper_payout_offer", now(), {
          settleMs: PAYOUT_OFFER_MS,
          amount: view.subtask.price,
          fails: "tecINSUFFICIENT_RESERVE",
        });
        return delayThenFail(ledgerError(), PAYOUT_OFFER_MS + 100);
      }
      return untilPaid(code, startPayout(code));
    },
    submitPin: async (code, pin) => {
      const view = load(code);
      if (view.state === "locked")
        return delay<SubmitPinResponse>({ result: "locked", claim: view });
      requireMine(view);
      if (view.proof === "photo")
        throw new ApiError(409, "conflict", "This sub-task pays for the photo. Send it instead.");
      if (!/^\d{4}$/.test(pin)) throw new ApiError(400, "bad_request", "The PIN has 4 digits.");
      if (pin === FIXTURE_PIN) {
        startPayout(code);
        const payoutHash = entry(code).ledger.txs.find((tx) => tx.kind === "helper_payout")?.hash;
        const claim = save({
          ...view,
          state: "paying",
          payout: payoutHash
            ? { amount: view.subtask.price, tx_hash: payoutHash, status: "pending" }
            : null,
        });
        return delay<SubmitPinResponse>({ result: "correct", claim });
      }
      const left = view.pin_attempts_left - 1;
      const claim = save({
        ...view,
        pin_attempts_left: left,
        state: left <= 0 ? "locked" : view.state,
      });
      return delay<SubmitPinResponse>({ result: left <= 0 ? "locked" : "wrong", claim });
    },
    /** The open fixture codes (OPEN, RACE, FLAK, SOON) still open on this phone: claimed, lost and expired ones drop out. */
    listOpenSubtasks: async () => {
      const server_time = new Date(now()).toISOString();
      if (emptyOpenSubtasks()) return delay({ server_time, subtasks: [] });
      const subtasks = OPEN_FIXTURE_CLAIM_CODES.map(load)
        .filter((view) => view.state === "open")
        .map(toOpenSubtaskSummary);
      return delay({ server_time, subtasks });
    },
  };
}

function ledgerError(): ApiError {
  return new ApiError(502, "ledger_error", "The payment did not go through. Try again.");
}

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function delayThenFail(error: Error, ms = LATENCY_MS): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(error), ms));
}

/** Reports progress in steps over UPLOAD_MS. With `fail`, the connection drops at 60%. */
function simulateUpload({ onProgress, signal }: UploadOptions = {}, fail = false): Promise<void> {
  return new Promise((resolve, reject) => {
    let tick = 0;
    const abort = () => {
      clearInterval(timer);
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    };
    const timer = setInterval(() => {
      tick += 1;
      if (fail && tick > UPLOAD_TICKS * 0.6) {
        clearInterval(timer);
        signal?.removeEventListener("abort", abort);
        reject(new TypeError("Failed to fetch"));
        return;
      }
      onProgress?.(tick / UPLOAD_TICKS);
      if (tick >= UPLOAD_TICKS) {
        clearInterval(timer);
        signal?.removeEventListener("abort", abort);
        resolve();
      }
    }, UPLOAD_MS / UPLOAD_TICKS);
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
  });
}
