import type { ClaimNft, ClaimTx, ClaimView, TxKind } from "@/lib/contract";
import { describe, expect, it } from "vitest";
import {
  escrowText,
  holderText,
  isMine,
  newRows,
  shouldPollLedger,
  txLabel,
  type TxLabelContext,
} from "./ledger";
import { hasJargon } from "./plain-words";

const NFT: ClaimNft = {
  id: "000800005A0B6C2E1F3D4A5B6C7D8E9F0A1B2C3D4E5F6071B26F1C4A00000042",
  explorer_url: "https://testnet.xrpl.org/nft/0008",
  holder: "vault",
  parent_nft_id: null,
  parent_explorer_url: null,
};

function tx(kind: TxKind, overrides: Partial<ClaimTx> = {}): ClaimTx {
  return {
    hash: `H_${kind}`,
    kind,
    status: "validated",
    amount: null,
    explorer_url: `https://testnet.xrpl.org/transactions/H_${kind}`,
    nft_id: null,
    submitted_at: "2026-10-11T19:00:00.000Z",
    validated_at: "2026-10-11T19:00:04.000Z",
    error: null,
    ...overrides,
  };
}

function view(overrides: Partial<ClaimView> = {}): ClaimView {
  return {
    code: "7Q2K",
    state: "open",
    subtask: {
      description: "Save a seat",
      place: "Main Stacks",
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
    nft: NFT,
    escrow: {
      amount: "4.00",
      vault_address: "r37hDaqXGUL574V8y91XSoktYDpc9HpPjN",
      vault_explorer_url: "https://testnet.xrpl.org/accounts/r37hDaqXGUL574V8y91XSoktYDpc9HpPjN",
    },
    transactions: [],
    ...overrides,
  };
}

const mine: TxLabelContext = { mine: true, price: "4" };

describe("txLabel", () => {
  it("names the sub-task's steps in plain words", () => {
    expect(txLabel(tx("subtask_nft_mint"), mine)).toBe("Minted");
    expect(txLabel(tx("subtask_nft_offer"), mine)).toBe("Offered to anyone");
    expect(txLabel(tx("subtask_claim"), mine)).toBe("Claimed by you");
    expect(txLabel(tx("helper_payout_offer", { amount: "4.00" }), mine)).toBe("Payout offer");
    expect(txLabel(tx("helper_payout", { amount: "4.00" }), mine)).toBe("Paid $4.00");
    expect(txLabel(tx("nft_burn"), mine)).toBe("Burned");
    expect(txLabel(tx("subtask_escrow", { amount: "4.00" }), mine)).toBe("$4.00 put in the vault");
    expect(txLabel(tx("agent_refund", { amount: "4.00" }), mine)).toBe("Refunded $4.00");
  });

  it("says whose claim it was", () => {
    expect(txLabel(tx("subtask_claim"), { mine: false, price: "4" })).toBe(
      "Claimed by another helper",
    );
    expect(txLabel(tx("subtask_claim"), { mine: null, price: "4" })).toBe("Claimed by a helper");
    expect(txLabel(tx("helper_payout", { amount: "4.00" }), { mine: false, price: "4" })).toBe(
      "Paid $4.00 to another helper",
    );
  });

  it("falls back to the sub-task's pay when a payout row has no amount", () => {
    expect(txLabel(tx("helper_payout"), { mine: true, price: "4.5" })).toBe("Paid $4.50");
    expect(txLabel(tx("helper_payout", { amount: "0" }), { mine: true, price: "4.5" })).toBe(
      "Paid $4.50",
    );
  });

  it("has a label for every kind, with no crypto words beyond NFT and XRPL", () => {
    const kinds: TxKind[] = [
      "wallet_setup",
      "requester_funding",
      "task_escrow",
      "task_nft_mint",
      "task_nft_offer",
      "task_claim",
      "subtask_escrow",
      "subtask_nft_mint",
      "subtask_nft_offer",
      "subtask_claim",
      "helper_payout_offer",
      "helper_payout",
      "agent_payout_offer",
      "agent_payout",
      "nft_burn",
      "requester_refund",
      "agent_refund",
    ];
    for (const kind of kinds) {
      for (const who of [true, false, null]) {
        const label = txLabel(tx(kind, { amount: "4" }), { mine: who, price: "4" });
        expect(label, kind).toMatch(/\S/);
        expect(hasJargon(label), label).toBe(false);
      }
    }
  });
});

describe("holderText", () => {
  it("says who holds the NFT", () => {
    expect(holderText("vault", "open")).toBe("Held by the vault until someone claims");
    expect(holderText("you", "claimed_by_you")).toBe("Held by you");
    expect(holderText("helper", "already_claimed")).toBe("Held by another helper");
    expect(holderText("burned", "paid")).toBe("Returned to the vault and burned");
  });

  it("does not say 'until someone claims' once the NFT came back with the payout or a refund", () => {
    expect(holderText("vault", "paid")).toBe("Back with the vault, about to be burned");
    expect(holderText("vault", "paying")).toBe("Back with the vault, about to be burned");
    expect(holderText("vault", "expired")).toBe("Held by the vault");
  });
});

describe("escrowText", () => {
  it("is held by the vault until it is paid out or returned", () => {
    expect(escrowText(view())).toBe("$4.00 held by the vault");
    expect(escrowText(view({ transactions: [tx("helper_payout", { status: "pending" })] }))).toBe(
      "$4.00 held by the vault",
    );
    expect(escrowText(view({ transactions: [tx("helper_payout")] }))).toBe(
      "$4.00 paid out by the vault",
    );
    expect(escrowText(view({ transactions: [tx("agent_refund")] }))).toBe(
      "$4.00 returned by the vault",
    );
  });

  it("uses the sub-task's pay when the server sends no escrow", () => {
    expect(escrowText(view({ escrow: null }))).toBe("$4.00 held by the vault");
  });
});

describe("isMine", () => {
  it("reads the NFT holder first, then the page's state", () => {
    expect(isMine(view({ nft: { ...NFT, holder: "you" } }))).toBe(true);
    expect(isMine(view({ nft: { ...NFT, holder: "helper" } }))).toBe(false);
    expect(isMine(view({ state: "paid", nft: { ...NFT, holder: "burned" } }))).toBe(true);
    expect(isMine(view({ state: "already_claimed", nft: { ...NFT, holder: "burned" } }))).toBe(
      false,
    );
    expect(isMine(view({ state: "expired", nft: { ...NFT, holder: "burned" } }))).toBeNull();
  });
});

describe("shouldPollLedger", () => {
  it("polls from the claim until the NFT is burned", () => {
    expect(shouldPollLedger(view({ state: "claimed_by_you" }))).toBe(true);
    expect(shouldPollLedger(view({ state: "paying" }))).toBe(true);
    expect(shouldPollLedger(view({ state: "paid", nft: { ...NFT, holder: "vault" } }))).toBe(true);
    expect(shouldPollLedger(view({ state: "paid", nft: { ...NFT, holder: "burned" } }))).toBe(
      false,
    );
  });

  it("waits for the refund and burn after a failure, then stops", () => {
    expect(shouldPollLedger(view({ state: "expired", nft: { ...NFT, holder: "vault" } }))).toBe(
      true,
    );
    expect(shouldPollLedger(view({ state: "expired", nft: { ...NFT, holder: "burned" } }))).toBe(
      false,
    );
    expect(shouldPollLedger(view({ state: "locked", nft: null }))).toBe(false);
  });

  it("does not poll a sub-task nobody holds, or another phone's, unless a transaction is pending", () => {
    expect(shouldPollLedger(view({ state: "open" }))).toBe(false);
    expect(shouldPollLedger(view({ state: "already_claimed" }))).toBe(false);
    expect(
      shouldPollLedger(
        view({ state: "open", transactions: [tx("subtask_nft_offer", { status: "pending" })] }),
      ),
    ).toBe(true);
  });

  it("stops once paid when the server sends no NFT (an older server)", () => {
    expect(shouldPollLedger(view({ state: "paid", nft: null }))).toBe(false);
  });
});

describe("newRows", () => {
  it("lists the hashes that were not there before, in order", () => {
    const seen = new Set(["A", "B"]);
    expect(newRows(seen, [{ hash: "A" }, { hash: "B" }, { hash: "C" }, { hash: "D" }])).toEqual([
      "C",
      "D",
    ]);
    expect(newRows(seen, [{ hash: "A" }])).toEqual([]);
  });
});
