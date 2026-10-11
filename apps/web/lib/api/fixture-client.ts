/**
 * ApiClient for fixture mode. Keeps claim state in memory for this tab, so
 * the claim page can be clicked through: claim -> photo -> PIN -> paid.
 * The PIN is FIXTURE_PIN ("4821"). Reload to reset.
 * Claims take about one ledger close, uploads report progress, and the
 * RACE, FLAK and SOON codes act out a lost race, a bad signal and a deadline.
 * listOpenSubtasks() lists the codes that start open; `?fixtures=empty` on the
 * page URL lists none.
 */
import { type ClaimView, type SubmitPinResponse } from "@agent-pledge/shared";
import { buildFixtureSnapshot } from "../fixtures/board";
import { buildFixtureClaim, FIXTURE_PIN, OPEN_FIXTURE_CLAIM_CODES, toOpenSubtaskSummary } from "../fixtures/claims";
import { fakeHex } from "../fixtures/factories";
import { ApiError, type ApiClient, type UploadOptions } from "./client";

const LATENCY_MS = 300;
const CLAIM_MS = 5000; // the server creates a wallet and accepts the NFT offer: 4 to 8 seconds
const UPLOAD_MS = 1500;
const UPLOAD_TICKS = 10;
const PAYOUT_MS = 4000; // about one XRPL ledger close

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
  const claims = new Map<string, ClaimView>();
  const payingSince = new Map<string, number>();
  /** "FLAK:claim", "FLAK:photo": the one-time failures that already happened. */
  const flaked = new Set<string>();

  /** True the first time a FLAK action runs, so the page sees one failure, then success on retry. */
  function flakes(code: string, action: "claim" | "photo"): boolean {
    if (code !== "FLAK" || flaked.has(`${code}:${action}`)) return false;
    flaked.add(`${code}:${action}`);
    return true;
  }

  function load(code: string): ClaimView {
    let view = claims.get(code) ?? buildFixtureClaim(code, now());
    if (!view) throw new ApiError(404, "not_found", "This claim link is not valid.");
    const live = view.state === "open" || view.state === "claimed_by_you";
    if (live && Date.parse(view.subtask.deadline_at) <= now()) view = { ...view, state: "expired" };
    if (view.state === "paying") {
      const since = payingSince.get(code) ?? now();
      payingSince.set(code, since);
      if (now() - since >= PAYOUT_MS && view.payout) {
        view = { ...view, state: "paid", payout: { ...view.payout, status: "validated" } };
      }
    }
    view = { ...view, server_time: new Date(now()).toISOString() };
    claims.set(code, view);
    return view;
  }

  function save(view: ClaimView): ClaimView {
    claims.set(view.code, view);
    return view;
  }

  function requireMine(view: ClaimView): void {
    if (view.state === "expired") throw new ApiError(410, "expired", "Time ran out for this sub-task.");
    if (view.state !== "claimed_by_you") throw new ApiError(403, "not_your_claim", "This phone did not claim this sub-task.");
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
      if (code === "RACE" && view.state === "open") {
        save({ ...view, state: "already_claimed" });
        return delayThenFail(new ApiError(409, "already_claimed", "Someone else claimed this first."), CLAIM_MS);
      }
      if (view.state === "open") {
        const claimed = save({ ...view, state: "claimed_by_you" });
        if (flakes(code, "claim")) return delayThenFail(new TypeError("Failed to fetch"), CLAIM_MS);
        return delay(claimed, CLAIM_MS);
      }
      if (view.state === "already_claimed") throw new ApiError(409, "already_claimed", "Someone else claimed this first.");
      if (view.state === "expired") throw new ApiError(410, "expired", "Time ran out for this sub-task.");
      return delay(view);
    },
    uploadPhoto: async (code, photo, note, options) => {
      requireMine(load(code));
      await simulateUpload(options, flakes(code, "photo"));
      const view = load(code);
      requireMine(view);
      const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(photo) : "/fixtures/seat-photo.svg";
      return save({ ...view, photo: { url, note: note || null, added_at: new Date(now()).toISOString() } });
    },
    submitPin: async (code, pin) => {
      const view = load(code);
      if (view.state === "locked") return delay<SubmitPinResponse>({ result: "locked", claim: view });
      requireMine(view);
      if (!/^\d{4}$/.test(pin)) throw new ApiError(400, "bad_request", "The PIN has 4 digits.");
      if (pin === FIXTURE_PIN) {
        payingSince.set(code, now());
        const claim = save({
          ...view,
          state: "paying",
          payout: { amount: view.subtask.price, tx_hash: fakeHex(now() % 100_000), status: "pending" },
        });
        return delay<SubmitPinResponse>({ result: "correct", claim });
      }
      const left = view.pin_attempts_left - 1;
      const claim = save({ ...view, pin_attempts_left: left, state: left <= 0 ? "locked" : view.state });
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
