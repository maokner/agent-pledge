import type { ClaimView } from "@/lib/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { abortableSleep, afterPayError, needsPayCall, payingMessage, payUntilPaid } from "./payout";

const paid = { code: "7Q2K", state: "paid" } as ClaimView;

describe("needsPayCall", () => {
  const paying = { proof: "photo", state: "paying", payout: null } as const;

  it("asks to pay in photo mode while paying with no payout", () => {
    expect(needsPayCall(paying, { uploading: false })).toBe(true);
  });

  it("waits while the photo upload is still waiting for its answer, which may carry the payout", () => {
    expect(needsPayCall(paying, { uploading: true })).toBe(false);
  });

  it("never asks in PIN mode, before the photo, or once the payout is in", () => {
    expect(needsPayCall({ ...paying, proof: "pin" }, { uploading: false })).toBe(false);
    expect(needsPayCall({ ...paying, state: "claimed_by_you" }, { uploading: false })).toBe(false);
    expect(
      needsPayCall(
        { ...paying, payout: { amount: "4", tx_hash: "H", status: "pending" } },
        { uploading: false },
      ),
    ).toBe(false);
    expect(needsPayCall({ ...paying, state: "paid" }, { uploading: false })).toBe(false);
  });
});

describe("afterPayError", () => {
  it("retries a ledger error, a server error and a lost connection", () => {
    expect(afterPayError(new ApiError(502, "ledger_error", "XRPL said no"))).toBe("retry");
    expect(afterPayError(new ApiError(500, "internal", "Server error"))).toBe("retry");
    expect(afterPayError(new TypeError("Failed to fetch"))).toBe("retry");
  });

  it("stops when pay does not apply: no photo yet, PIN mode, not this phone, time is up", () => {
    expect(afterPayError(new ApiError(409, "conflict", "No photo yet"))).toBe("stop");
    expect(afterPayError(new ApiError(401, "not_your_claim", "Not yours"))).toBe("stop");
    expect(afterPayError(new ApiError(410, "expired", "Too late"))).toBe("stop");
  });
});

describe("payUntilPaid", () => {
  const instantSleep = vi.fn(async () => undefined);
  afterEach(() => instantSleep.mockClear());

  it("hands over the paid claim from the first answer", async () => {
    const onPaid = vi.fn();
    const onStop = vi.fn();
    const pay = vi.fn(async () => paid);

    await payUntilPaid({ pay, onPaid, onStop, signal: new AbortController().signal });

    expect(pay).toHaveBeenCalledTimes(1);
    expect(onPaid).toHaveBeenCalledWith(paid);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("asks again after a ledger error or a lost answer, waiting between tries", async () => {
    const onPaid = vi.fn();
    const pay = vi
      .fn<() => Promise<ClaimView>>()
      .mockRejectedValueOnce(new ApiError(502, "ledger_error", "tecPATH_DRY"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(paid);

    await payUntilPaid({
      pay,
      onPaid,
      onStop: vi.fn(),
      signal: new AbortController().signal,
      retryMs: 6000,
      sleep: instantSleep,
    });

    expect(pay).toHaveBeenCalledTimes(3);
    expect(instantSleep).toHaveBeenCalledTimes(2);
    expect(instantSleep).toHaveBeenCalledWith(6000, expect.any(AbortSignal));
    expect(onPaid).toHaveBeenCalledWith(paid);
  });

  it("stops on a 409 conflict and lets the page reload the claim", async () => {
    const onStop = vi.fn();
    const onPaid = vi.fn();
    const conflict = new ApiError(409, "conflict", "No photo yet");

    await payUntilPaid({
      pay: vi.fn(async () => Promise.reject(conflict)),
      onPaid,
      onStop,
      signal: new AbortController().signal,
      sleep: instantSleep,
    });

    expect(onStop).toHaveBeenCalledWith(conflict);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("ends quietly once aborted (the poll saw the payout first), ignoring a late answer", async () => {
    const controller = new AbortController();
    const onPaid = vi.fn();
    let answer: (view: ClaimView) => void = () => undefined;
    const pay = vi.fn(() => new Promise<ClaimView>((resolve) => (answer = resolve)));

    const run = payUntilPaid({ pay, onPaid, onStop: vi.fn(), signal: controller.signal });
    controller.abort();
    answer(paid);
    await run;

    expect(onPaid).not.toHaveBeenCalled();
  });

  it("does not retry after an abort during the wait", async () => {
    const controller = new AbortController();
    const pay = vi.fn(async () => Promise.reject(new ApiError(502, "ledger_error", "x")));

    await payUntilPaid({
      pay,
      onPaid: vi.fn(),
      onStop: vi.fn(),
      signal: controller.signal,
      sleep: async () => controller.abort(),
    });

    expect(pay).toHaveBeenCalledTimes(1);
  });
});

describe("abortableSleep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves after the time, or at once on abort", async () => {
    let done = false;
    void abortableSleep(6000, new AbortController().signal).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(5999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);

    const controller = new AbortController();
    let early = false;
    void abortableSleep(6000, controller.signal).then(() => (early = true));
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(early).toBe(true);
  });
});

describe("payingMessage", () => {
  it("says it is paying on the XRPL, then reassures when it takes longer", () => {
    expect(payingMessage(0)).toBe("Paying you on the XRPL… This takes a few seconds.");
    expect(payingMessage(12_000)).toBe("Still working. This can take a few more seconds.");
    expect(payingMessage(30_000)).toBe(
      "This is slower than usual. Keep this page open, it will finish.",
    );
  });
});
