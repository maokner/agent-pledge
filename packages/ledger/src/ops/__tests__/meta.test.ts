import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TransactionMetadata } from "xrpl";
import { getAcceptedNftId, getCreatedOfferId, getMintedNftId } from "../meta.js";

/** Real validated metadata from XRPL testnet (rippled 3.4.1), captured on 2026-10-11. */
const samples = JSON.parse(
  readFileSync(new URL("./fixtures/testnet-metas.json", import.meta.url), "utf8"),
) as {
  nftId: string;
  offerId: string;
  mint: TransactionMetadata;
  offer: TransactionMetadata;
  accept: TransactionMetadata;
};

/** The same meta without the synthetic fields that rippled 1.11+ adds, to test the fallbacks. */
function withoutSynthetic(meta: TransactionMetadata): TransactionMetadata {
  const copy = structuredClone(meta) as unknown as Record<string, unknown>;
  delete copy.nftoken_id;
  delete copy.offer_id;
  return copy as unknown as TransactionMetadata;
}

describe("getMintedNftId", () => {
  it("reads nftoken_id", () => {
    expect(getMintedNftId(samples.mint)).toBe(samples.nftId);
  });

  it("falls back to getNFTokenID, which diffs the NFTokenPages", () => {
    // The sample page already held one NFT, so this checks the diff picks the new one.
    expect(getMintedNftId(withoutSynthetic(samples.mint))).toBe(samples.nftId);
  });

  it("returns undefined without meta", () => {
    expect(getMintedNftId(undefined)).toBeUndefined();
  });
});

describe("getCreatedOfferId", () => {
  it("reads offer_id", () => {
    expect(getCreatedOfferId(samples.offer)).toBe(samples.offerId);
  });

  it("falls back to the CreatedNode with LedgerEntryType NFTokenOffer, not the DirectoryNodes", () => {
    expect(getCreatedOfferId(withoutSynthetic(samples.offer))).toBe(samples.offerId);
  });

  it("returns undefined when no offer was created", () => {
    expect(getCreatedOfferId(withoutSynthetic(samples.mint))).toBeUndefined();
  });
});

describe("getAcceptedNftId", () => {
  it("reads nftoken_id", () => {
    expect(getAcceptedNftId(samples.accept)).toBe(samples.nftId);
  });

  it("falls back to the deleted NFTokenOffer", () => {
    expect(getAcceptedNftId(withoutSynthetic(samples.accept))).toBe(samples.nftId);
  });

  it("returns undefined for meta without an accepted offer", () => {
    expect(getAcceptedNftId(withoutSynthetic(samples.offer))).toBeUndefined();
  });
});
