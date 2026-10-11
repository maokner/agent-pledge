import type { ClaimView } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { afterError, claimingMessage, stepFor } from "./flow";
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
  });

  it("asks for a photo first after this phone claims", () => {
    expect(stepFor(view({ state: "claimed_by_you" }), { photoSkipped: false })).toBe("photo");
  });

  it("moves to the PIN once the photo is added or skipped", () => {
    expect(stepFor(view({ state: "claimed_by_you", photo }), { photoSkipped: false })).toBe("pin");
    expect(stepFor(view({ state: "claimed_by_you" }), { photoSkipped: true })).toBe("pin");
  });

  it("goes straight to the PIN if a PIN was already tried, even without a photo", () => {
    expect(
      stepFor(view({ state: "claimed_by_you", pin_attempts_left: 2 }), { photoSkipped: false }),
    ).toBe("pin");
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
