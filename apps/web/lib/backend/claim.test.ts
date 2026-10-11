import { describe, expect, it } from "vitest";
import { claimViewFromBackend, createHelperTokenStore } from "./claim";
import { backendClaim, backendMedia, hash } from "./test-payloads";

const NOW = Date.parse("2026-10-11T18:01:00.000Z");
const view = (overrides: Parameters<typeof backendClaim>[0] = {}, timeLimitMinutes: number | null = 3) =>
  claimViewFromBackend(backendClaim(overrides), { now: NOW, timeLimitMinutes });

describe("claimViewFromBackend: the page's state from status, claimed_by_you, pin and payout", () => {
  it("is open while nobody has claimed it", () => {
    expect(view().state).toBe("open");
  });

  it("is claimed_by_you for the phone holding the token, and already_claimed for anyone else", () => {
    expect(view({ status: "claimed", claimed_by_you: true }).state).toBe("claimed_by_you");
    expect(view({ status: "claimed", claimed_by_you: false }).state).toBe("already_claimed");
    expect(view({ status: "done", claimed_by_you: false }).state).toBe("already_claimed");
  });

  it("is expired once the sub-task failed", () => {
    expect(view({ status: "failed", claimed_by_you: true }).state).toBe("expired");
    expect(view({ status: "failed" }).state).toBe("expired");
  });

  it("is locked after three wrong PINs, until the deadline fails it", () => {
    const locked = view({ status: "claimed", claimed_by_you: true, pin: { attempts: 3, attempts_left: 0, locked: true, verified: false } });

    expect(locked.state).toBe("locked");
    expect(locked.pin_attempts_left).toBe(0);
  });

  it("is paying once the PIN is right and the payout has not landed, then paid", () => {
    const verified = { attempts: 0, attempts_left: 3, locked: false, verified: true };
    const payout = { amount: "4.00", tx_hash: hash(9), explorer_url: `https://testnet.xrpl.org/transactions/${hash(9)}` };

    expect(view({ status: "claimed", claimed_by_you: true, pin: verified }).state).toBe("paying");
    expect(view({ status: "done", claimed_by_you: true, pin: verified, payout }).state).toBe("paid");
    expect(view({ status: "done", claimed_by_you: true, pin: verified, payout }).payout).toEqual({
      amount: "4.00",
      tx_hash: hash(9),
      status: "validated",
      explorer_url: `https://testnet.xrpl.org/transactions/${hash(9)}`,
    });
  });

  it("carries the sub-task, with the deadline, and the phone's clock as the server time", () => {
    const claim = view();

    expect(claim.code).toBe("7Q2K");
    expect(claim.subtask).toEqual({
      description: "Save me a seat at the front table",
      place: "Main Stacks",
      time_limit_minutes: 3,
      deadline_at: "2026-10-11T18:03:00.000Z",
      price: "4.00",
    });
    expect(claim.server_time).toBe("2026-10-11T18:01:00.000Z");
    expect(claim.pin_attempts_left).toBe(3);
  });

  it("falls back to the minutes left when it does not know the time limit", () => {
    expect(view({}, null).subtask.time_limit_minutes).toBe(2);
  });

  it("shows the photo and note only to the phone that claimed", () => {
    const withPhoto = { status: "claimed" as const, photo: backendMedia(), helper_note: "Front table, left side" };

    expect(view({ ...withPhoto, claimed_by_you: true }).photo).toMatchObject({
      url: "http://localhost:3001/media/med_p0p0p0p0p0p0p0p0",
      note: "Front table, left side",
    });
    expect(view({ ...withPhoto, claimed_by_you: false }).photo).toBeNull();
  });
});

describe("createHelperTokenStore", () => {
  it("keeps one token per claim code, whatever the code's case", () => {
    const storage = memoryStorage();
    const store = createHelperTokenStore(() => storage);

    store.set("7q2k", "token-a");
    store.set("ABCD", "token-b");

    expect(store.get("7Q2K")).toBe("token-a");
    expect(store.get("abcd")).toBe("token-b");
    expect(store.get("WXYZ")).toBeNull();
  });

  it("works, without remembering, when storage is missing or throws", () => {
    const throwing = createHelperTokenStore(() => {
      throw new Error("SecurityError");
    });
    const broken = createHelperTokenStore(() => ({
      ...memoryStorage(),
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    }));

    expect(() => throwing.set("7Q2K", "t")).not.toThrow();
    expect(throwing.get("7Q2K")).toBeNull();
    expect(() => broken.set("7Q2K", "t")).not.toThrow();
    expect(broken.get("7Q2K")).toBeNull();
    expect(createHelperTokenStore(() => null).get("7Q2K")).toBeNull();
  });
});

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}
