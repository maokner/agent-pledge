import { describe, expect, it } from "vitest";
import {
  amountLabel,
  CAST,
  CHAPTERS,
  chapterOf,
  chapterTxs,
  durationLabel,
  elapsedLabel,
  GALLERY,
  NFTS,
  nftName,
  RUN_END,
  RUN_START,
  SUBTASK_NFT_ID,
  TASK_NFT_ID,
  tokenBalance,
  TRANSACTIONS,
  TX_COPY,
  txNumber,
  typeLabel,
} from "./walkthrough";

describe("the recorded run", () => {
  it("has 15 validated transactions in ledger order", () => {
    expect(TRANSACTIONS).toHaveLength(15);
    for (const tx of TRANSACTIONS) expect(tx.result).toBe("tesSUCCESS");
    const ledgers = TRANSACTIONS.map((t) => t.ledgerIndex);
    expect([...ledgers].sort((a, b) => a - b)).toEqual(ledgers);
  });

  it("has a plain-words title for every transaction kind", () => {
    for (const tx of TRANSACTIONS) {
      expect(TX_COPY[tx.kind].title).toBeTruthy();
      expect(TX_COPY[tx.kind].detail).toBeTruthy();
    }
  });

  it("puts every transaction but the setup funding into exactly one chapter", () => {
    const covered = CHAPTERS.flatMap((c) => c.txKinds);
    expect(new Set(covered).size).toBe(covered.length);
    for (const tx of TRANSACTIONS) {
      if (tx.kind === "requester_funding") expect(chapterOf(tx)).toBeNull();
      else expect(chapterOf(tx)).not.toBeNull();
    }
    expect(covered).toHaveLength(TRANSACTIONS.length - 1);
  });

  it("keeps each chapter's transactions in ledger order", () => {
    for (const chapter of CHAPTERS) {
      const numbers = chapterTxs(chapter).map(txNumber);
      expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    }
  });

  it("names the five accounts, story roles first", () => {
    expect(CAST.map((c) => c.role)).toEqual([
      "requester",
      "local agent",
      "vault",
      "helper",
      "treasury",
    ]);
    // The story's money adds up: -5 + 1 + 0 + 4 = 0.
    const net = CAST.filter((c) => c.net !== null).reduce((sum, c) => sum + Number(c.net), 0);
    expect(net).toBe(0);
  });

  it("tells the story of both NFTs in six moves each", () => {
    expect(NFTS.map((n) => n.id)).toEqual([TASK_NFT_ID, SUBTASK_NFT_ID]);
    for (const nft of NFTS) {
      expect(nft.txs.map((t) => t.type)).toEqual([
        "NFTokenMint",
        "NFTokenCreateOffer",
        "NFTokenAcceptOffer",
        "NFTokenCreateOffer",
        "NFTokenAcceptOffer",
        "NFTokenBurn",
      ]);
    }
    expect(NFTS[1]!.uriData.parent_nft_id).toBe(TASK_NFT_ID);
  });

  it("lists every screenshot once in the gallery", () => {
    const srcs = GALLERY.map((s) => s.src);
    expect(new Set(srcs).size).toBe(srcs.length);
    expect(srcs).toHaveLength(13);
  });
});

describe("labels", () => {
  it("shows token amounts as dollars and a zero XRP offer as free", () => {
    expect(
      amountLabel({
        amount: null,
        deliveredAmount: "5 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)",
        boardAmount: "$5.00",
      }),
    ).toBe("$5.00");
    expect(
      amountLabel({ amount: "0 XRP (0 drops)", deliveredAmount: null, boardAmount: "$0.00" }),
    ).toBe("Free");
    expect(amountLabel({ amount: null, deliveredAmount: null, boardAmount: "$1.00" })).toBe(
      "$1.00",
    );
    expect(amountLabel({ amount: null, deliveredAmount: null, boardAmount: null })).toBeNull();
  });

  it("shortens transaction types to one word", () => {
    expect(typeLabel("Payment")).toBe("Payment");
    expect(typeLabel("NFTokenMint")).toBe("Mint");
    expect(typeLabel("NFTokenCreateOffer")).toBe("Offer");
    expect(typeLabel("NFTokenAcceptOffer")).toBe("Accept");
    expect(typeLabel("NFTokenBurn")).toBe("Burn");
  });

  it("counts time from the first ledger close", () => {
    expect(elapsedLabel(RUN_START)).toBe("+0:00");
    expect(elapsedLabel("2026-10-11T23:26:51Z", "2026-10-11T23:26:42Z")).toBe("+0:09");
    expect(elapsedLabel("2026-10-11T23:30:20Z", "2026-10-11T23:26:42Z")).toBe("+3:38");
    expect(durationLabel(RUN_START, RUN_END)).toBe("3 min 38 s");
    expect(durationLabel("2026-10-11T23:26:42Z", "2026-10-11T23:28:42Z")).toBe("2 min");
  });

  it("names the two NFTs", () => {
    expect(nftName(TASK_NFT_ID)).toBe("Task NFT");
    expect(nftName(SUBTASK_NFT_ID)).toBe("Sub-task NFT");
    expect(nftName("00")).toBe("NFT");
  });

  it("reads a token balance as dollars", () => {
    expect(tokenBalance(["101 USD (issuer r96NfRjhJrHyZBjNRepH2M7kVNdUVG71BT)"])).toBe("$101.00");
    expect(tokenBalance([])).toBe("$0.00");
  });
});
