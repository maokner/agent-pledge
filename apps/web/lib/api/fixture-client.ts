/**
 * ApiClient for fixture mode. Keeps claim state in memory for this tab, so
 * the claim page can be clicked through: claim -> photo -> PIN -> paid.
 * The PIN is FIXTURE_PIN ("4821"). Reload to reset.
 */
import { type ClaimView, type SubmitPinResponse } from "@agent-pledge/shared";
import { buildFixtureSnapshot } from "../fixtures/board";
import { buildFixtureClaim, FIXTURE_PIN } from "../fixtures/claims";
import { fakeHex } from "../fixtures/factories";
import { ApiError, type ApiClient } from "./client";

const LATENCY_MS = 300;
const PAYOUT_MS = 4000; // about one XRPL ledger close

export function createFixtureApiClient(now: () => number = Date.now): ApiClient {
  const claims = new Map<string, ClaimView>();
  const payingSince = new Map<string, number>();

  function load(code: string): ClaimView {
    let view = claims.get(code) ?? buildFixtureClaim(code, now());
    if (!view) throw new ApiError(404, "not_found", "This claim link is not valid.");
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
        board_url: "/",
      });
    },
    createTask: (request) => {
      console.info("[fixtures] create_task", request);
      return delay({ task_id: `tsk_form_${now()}`, pin: FIXTURE_PIN, board_url: "/" });
    },

    getClaim: async (code) => delay(load(code)),
    claimSubtask: async (code) => {
      const view = load(code);
      if (view.state === "open") return delay(save({ ...view, state: "claimed_by_you" }));
      if (view.state === "already_claimed") throw new ApiError(409, "already_claimed", "Someone else claimed this first.");
      if (view.state === "expired") throw new ApiError(410, "expired", "Time ran out for this sub-task.");
      return delay(view);
    },
    uploadPhoto: async (code, photo, note) => {
      const view = load(code);
      requireMine(view);
      const url = typeof URL.createObjectURL === "function" ? URL.createObjectURL(photo) : "/fixtures/seat-photo.svg";
      return delay(save({ ...view, photo: { url, note: note || null, added_at: new Date(now()).toISOString() } }));
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
  };
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}
