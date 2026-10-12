import type { ClaimView } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { afterError, claimingMessage, progressFor, PROGRESS_STEPS, stepFor } from "./flow";
import { PLAIN_FALLBACK_MESSAGE } from "./plain-words";

function view(overrides: Partial<ClaimView> = {}): ClaimView {
  return {
    code: "7Q2K",
    state: "open",
    subtask: {
      description: "Save a seat at the front table",
      place: "Main Stacks, front table",
      time_limit_minutes: 3,
      deadline_at: "2026-10-11T19:03:00.000Z",
      price: "4",
    },
    photo: null,
    pin_attempts_left: 3,
    payout: null,
    server_time: "2026-10-11T19:00:00.000Z",
    proof: "photo",
    proof_sha256: null,
    nft: null,
    escrow: null,
    transactions: [],
    ...overrides,
  };
}

const photo = {
  url: "https://pledge.example/p.jpg",
  note: "Front table",
  added_at: "2026-10-11T19:01:00.000Z",
};

describe("stepFor", () => {
  it("shows the Claim button while the sub-task is open", () => {
    expect(stepFor(view(), { photoSkipped: false })).toBe("claim");
    expect(stepFor(view({ proof: "pin" }), { photoSkipped: false })).toBe("claim");
  });

  describe("photo mode (the photo pays)", () => {
    it("asks for the proof photo after this phone claims, with no way to skip it", () => {
      expect(stepFor(view({ state: "claimed_by_you" }), { photoSkipped: false })).toBe("photo");
      expect(stepFor(view({ state: "claimed_by_you" }), { photoSkipped: true })).toBe("photo");
    });

    it("never shows the PIN, even after a PIN try", () => {
      expect(
        stepFor(view({ state: "claimed_by_you", pin_attempts_left: 2 }), { photoSkipped: false }),
      ).toBe("photo");
    });

    it("shows Paying as soon as the photo is sent and its answer (the payout) is awaited", () => {
      expect(
        stepFor(view({ state: "claimed_by_you" }), { photoSkipped: false, sending: true }),
      ).toBe("paying");
    });

    it("follows the server once it answers: paying, then paid", () => {
      expect(
        stepFor(view({ state: "paying", photo }), { photoSkipped: false, sending: true }),
      ).toBe("paying");
      expect(stepFor(view({ state: "paid", photo }), { photoSkipped: false })).toBe("paid");
    });
  });

  describe("PIN mode", () => {
    const pin = (overrides: Partial<ClaimView> = {}) =>
      view({ proof: "pin", state: "claimed_by_you", ...overrides });

    it("asks for a photo first after this phone claims", () => {
      expect(stepFor(pin(), { photoSkipped: false })).toBe("photo");
    });

    it("moves to the PIN once the photo is added or skipped", () => {
      expect(stepFor(pin({ photo }), { photoSkipped: false })).toBe("pin");
      expect(stepFor(pin(), { photoSkipped: true })).toBe("pin");
    });

    it("goes straight to the PIN if a PIN was already tried, even without a photo", () => {
      expect(stepFor(pin({ pin_attempts_left: 2 }), { photoSkipped: false })).toBe("pin");
    });

    it("does not jump to Paying while a photo is being sent: the photo does not pay", () => {
      expect(stepFor(pin(), { photoSkipped: false, sending: true })).toBe("photo");
    });
  });

  it("maps the end states to their own screens", () => {
    expect(stepFor(view({ state: "paying" }), { photoSkipped: false })).toBe("paying");
    expect(stepFor(view({ state: "paid" }), { photoSkipped: false })).toBe("paid");
    expect(stepFor(view({ state: "already_claimed" }), { photoSkipped: false })).toBe(
      "already_claimed",
    );
    expect(stepFor(view({ state: "expired" }), { photoSkipped: false })).toBe("expired");
    expect(stepFor(view({ state: "locked" }), { photoSkipped: false })).toBe("locked");
  });
});

describe("progressFor", () => {
  it("has three steps in photo mode and four in PIN mode", () => {
    expect(PROGRESS_STEPS.photo).toEqual(["Claim", "Proof", "Paid"]);
    expect(PROGRESS_STEPS.pin).toEqual(["Claim", "Photo", "PIN", "Paid"]);
  });

  it("puts paying on the last step, still running, and paid on it, done", () => {
    expect(progressFor("claim", "photo")).toEqual({ index: 0, running: false });
    expect(progressFor("photo", "photo")).toEqual({ index: 1, running: false });
    expect(progressFor("paying", "photo")).toEqual({ index: 2, running: true });
    expect(progressFor("paid", "photo")).toEqual({ index: 2, running: false });
    expect(progressFor("pin", "pin")).toEqual({ index: 2, running: false });
    expect(progressFor("paying", "pin")).toEqual({ index: 3, running: true });
    expect(progressFor("paid", "pin")).toEqual({ index: 3, running: false });
  });

  it("shows no progress for the closed states", () => {
    for (const step of ["already_claimed", "expired", "locked"] as const) {
      expect(progressFor(step, "photo"), step).toBeNull();
      expect(progressFor(step, "pin"), step).toBeNull();
    }
  });
});

describe("afterError", () => {
  it("shows Already claimed when another phone won (409)", () => {
    const outcome = afterError(
      view(),
      new ApiError(409, "already_claimed", "Someone else claimed this first."),
    );
    expect(outcome).toEqual({ kind: "state", view: view({ state: "already_claimed" }) });
  });

  it("shows the expired screen when time ran out (410)", () => {
    const outcome = afterError(
      view({ state: "claimed_by_you" }),
      new ApiError(410, "expired", "Time ran out."),
    );
    expect(outcome).toEqual({ kind: "state", view: view({ state: "expired" }) });
  });

  it("shows the locked screen after the lockout (423)", () => {
    const outcome = afterError(
      view({ state: "claimed_by_you" }),
      new ApiError(423, "locked", "Locked."),
    );
    expect(outcome).toEqual({
      kind: "state",
      view: view({ state: "locked", pin_attempts_left: 0 }),
    });
  });

  it("keeps the step and shows the server's message for other errors, so the helper can retry", () => {
    const outcome = afterError(
      view(),
      new ApiError(403, "not_your_claim", "This phone did not claim this sub-task."),
    );
    expect(outcome).toEqual({ kind: "retry", message: "This phone did not claim this sub-task." });
  });

  it("puts a server message about the plumbing in plain words (PRD R7)", () => {
    const outcome = afterError(
      view(),
      new ApiError(502, "ledger_error", "The ledger did not accept the claim."),
    );
    expect(outcome).toEqual({ kind: "retry", message: PLAIN_FALLBACK_MESSAGE });
  });

  it("asks the page to re-check the server after a network error, since the request may have gone through", () => {
    const outcome = afterError(view(), new TypeError("Failed to fetch"));
    expect(outcome).toEqual({
      kind: "recheck",
      message: "No connection. Check your signal and try again.",
    });
  });
});

describe("claimingMessage", () => {
  it("explains the wait for the usual 4 to 8 seconds", () => {
    expect(claimingMessage(0)).toBe("Holding this sub-task for you…");
    expect(claimingMessage(7_999)).toBe("Holding this sub-task for you…");
  });

  it("reassures the helper when the claim is slow", () => {
    expect(claimingMessage(8_000)).toBe("Still working. This can take a few more seconds.");
    expect(claimingMessage(20_000)).toBe("This is slower than usual. Keep this page open.");
  });
});
