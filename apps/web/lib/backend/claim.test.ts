import { describe, expect, it } from "vitest";
import type { BackendClaimView } from "./types";
import { claimViewFromBackend, createHelperTokenStore, withPayout } from "./claim";
import {
  backendClaim,
  backendClaimNft,
  backendClaimTxs,
  backendMedia,
  backendTx,
  hash,
  NFT_IDS,
} from "./test-payloads";

const NOW = Date.parse("2026-10-11T18:01:00.000Z");
const view = (
  overrides: Parameters<typeof backendClaim>[0] = {},
  timeLimitMinutes: number | null = 3,
) => claimViewFromBackend(backendClaim(overrides), { now: NOW, timeLimitMinutes });

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
    const locked = view({
      status: "claimed",
      claimed_by_you: true,
      pin: { attempts: 3, attempts_left: 0, locked: true, verified: false },
    });

    expect(locked.state).toBe("locked");
    expect(locked.pin_attempts_left).toBe(0);
  });

  it("is paying once the PIN is right and the payout has not landed, then paid", () => {
    const verified = { attempts: 0, attempts_left: 3, locked: false, verified: true };
    const payout = {
      amount: "4.00",
      tx_hash: hash(9),
      explorer_url: `https://testnet.xrpl.org/transactions/${hash(9)}`,
    };

    expect(view({ status: "claimed", claimed_by_you: true, pin: verified }).state).toBe("paying");
    expect(view({ status: "done", claimed_by_you: true, pin: verified, payout }).state).toBe(
      "paid",
    );
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
    const withPhoto = {
      status: "claimed" as const,
      photo: backendMedia(),
      helper_note: "Front table, left side",
    };

    expect(view({ ...withPhoto, claimed_by_you: true }).photo).toMatchObject({
      url: "http://localhost:3001/media/med_p0p0p0p0p0p0p0p0",
      note: "Front table, left side",
    });
    expect(view({ ...withPhoto, claimed_by_you: false }).photo).toBeNull();
  });
});

describe("claimViewFromBackend: photo mode (the photo pays)", () => {
  const mine = { status: "claimed" as const, claimed_by_you: true };

  it("is claimed_by_you until the photo is in, then paying until the payout lands, then paid", () => {
    const payout = { amount: "4.00", tx_hash: hash(9), explorer_url: "https://x/9" };

    expect(view(mine).state).toBe("claimed_by_you");
    // A note alone is not the proof.
    expect(view({ ...mine, helper_note: "Front table" }).state).toBe("claimed_by_you");
    expect(view({ ...mine, photo: backendMedia() }).state).toBe("paying");
    expect(view({ ...mine, status: "done", photo: backendMedia(), payout }).state).toBe("paid");
  });

  it("stays on the PIN in PIN mode, photo or not", () => {
    expect(view({ ...mine, proof: "pin", photo: backendMedia() }).state).toBe("claimed_by_you");
  });

  it("does not show another phone's photo as paying", () => {
    expect(view({ status: "claimed", claimed_by_you: false, photo: backendMedia() }).state).toBe(
      "already_claimed",
    );
  });
});

describe("claimViewFromBackend: the ledger fields", () => {
  it("carries the proof mode, the proof hash, the NFT and the escrow as they are", () => {
    const claim = view({
      status: "claimed",
      claimed_by_you: true,
      proof_sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      nft: backendClaimNft({ holder: "you" }),
    });

    expect(claim.proof).toBe("photo");
    expect(claim.proof_sha256).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    );
    expect(claim.nft).toEqual({
      id: NFT_IDS.subtask,
      explorer_url: `https://testnet.xrpl.org/nft/${NFT_IDS.subtask}`,
      holder: "you",
      parent_nft_id: NFT_IDS.task,
      parent_explorer_url: `https://testnet.xrpl.org/nft/${NFT_IDS.task}`,
    });
    expect(claim.escrow).toEqual({
      amount: "4.00",
      vault_address: "r37hDaqXGUL574V8y91XSoktYDpc9HpPjN",
      vault_explorer_url: "https://testnet.xrpl.org/accounts/r37hDaqXGUL574V8y91XSoktYDpc9HpPjN",
    });
  });

  it("lists the transactions oldest first, with the web app's kind names", () => {
    const claim = view({ transactions: backendClaimTxs("subtask_nft_burn") });

    expect(claim.transactions.map((tx) => tx.kind)).toEqual([
      "subtask_escrow",
      "subtask_nft_mint",
      "subtask_nft_offer",
      "subtask_claim",
      "helper_payout_offer",
      "helper_payout",
      "nft_burn",
    ]);
    expect(claim.transactions[5]).toEqual({
      hash: hash(0x56),
      kind: "helper_payout",
      status: "validated",
      amount: "4.00",
      explorer_url: `https://testnet.xrpl.org/transactions/${hash(0x56)}`,
      nft_id: NFT_IDS.subtask,
      submitted_at: "2026-10-11T18:00:01.000Z",
      validated_at: "2026-10-11T18:00:04.000Z",
      error: null,
    });
  });

  it("keeps pending and failed rows, leaves out unknown kinds, and drops XRP amounts", () => {
    const claim = view({
      transactions: [
        backendTx({ hash: hash(1), kind: "subtask_claim", status: "pending", validated_at: null }),
        backendTx({
          hash: hash(2),
          kind: "helper_redeem_offer",
          status: "failed",
          error: "tecINSUFFICIENT_RESERVE",
        }),
        backendTx({ hash: hash(3), kind: "made_up_kind" as never }),
        backendTx({ hash: hash(4), kind: "wallet_setup", amount: "10", currency: "XRP" }),
      ],
    });

    expect(claim.transactions.map((tx) => [tx.kind, tx.status, tx.amount])).toEqual([
      ["subtask_claim", "pending", "5.00"],
      ["helper_payout_offer", "failed", "5.00"],
      ["wallet_setup", "validated", null],
    ]);
    expect(claim.transactions[1]?.error).toBe("tecINSUFFICIENT_RESERVE");
  });

  it("reads a server from before proof modes as PIN mode with nothing on the ledger", () => {
    const old = backendClaim({ status: "claimed", claimed_by_you: true, photo: backendMedia() });
    for (const key of ["proof", "proof_sha256", "nft", "escrow", "transactions"] as const)
      delete (old as Partial<BackendClaimView>)[key];

    const claim = claimViewFromBackend(old, { now: NOW, timeLimitMinutes: 3 });

    expect(claim).toMatchObject({
      state: "claimed_by_you",
      proof: "pin",
      proof_sha256: null,
      nft: null,
      escrow: null,
      transactions: [],
    });
  });

  it("reads an NFT holder it does not know as the vault", () => {
    expect(view({ nft: backendClaimNft({ holder: "someone" as never }) }).nft?.holder).toBe(
      "vault",
    );
  });
});

describe("withPayout", () => {
  const payout = { amount: "4.00", tx_hash: hash(9), explorer_url: "https://x/9" };
  const mine = backendClaim({ status: "claimed", claimed_by_you: true, photo: backendMedia() });

  it("puts a photo or pay response's payout on a claim that does not carry it yet", () => {
    const claim = claimViewFromBackend(withPayout(mine, payout), { now: NOW });

    expect(claim.state).toBe("paid");
    expect(claim.payout).toEqual({ ...payout, status: "validated" });
  });

  it("keeps the claim as it is without a payout, or when the claim already has one", () => {
    expect(withPayout(mine, null)).toBe(mine);
    expect(withPayout(mine, undefined)).toBe(mine);
    const paid = { ...mine, payout: { ...payout, tx_hash: hash(8) } };
    expect(withPayout(paid, payout).payout?.tx_hash).toBe(hash(8));
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
