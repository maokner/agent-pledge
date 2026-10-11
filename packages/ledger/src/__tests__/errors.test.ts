import { describe, expect, it } from "vitest";
import type { SubmittableTransaction, TxResponse } from "xrpl";
import {
  AlreadyClaimedError,
  InsufficientFundsError,
  InvalidTransactionError,
  LedgerError,
  NoTrustLineError,
  NotAllowedError,
  NotFoundError,
  OfferExpiredError,
  TxExpiredError,
} from "../errors.js";
import { errorForResult, RESULT_CODE_ERRORS, resultCode } from "../submit.js";

const ACCOUNT = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const OFFER = "A".repeat(64);
const NFT = "B".repeat(64);

const accept: SubmittableTransaction = {
  TransactionType: "NFTokenAcceptOffer",
  Account: ACCOUNT,
  NFTokenSellOffer: OFFER,
};
const burn: SubmittableTransaction = {
  TransactionType: "NFTokenBurn",
  Account: ACCOUNT,
  NFTokenID: NFT,
};
const payment: SubmittableTransaction = {
  TransactionType: "Payment",
  Account: ACCOUNT,
  Destination: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  Amount: "1",
};

describe("errorForResult", () => {
  it("maps tecOBJECT_NOT_FOUND on an offer accept to AlreadyClaimedError", () => {
    const error = errorForResult("tecOBJECT_NOT_FOUND", accept, ACCOUNT, undefined, "H");
    expect(error).toBeInstanceOf(AlreadyClaimedError);
    expect(error.code).toBe("ALREADY_CLAIMED");
    expect(error.resultCode).toBe("tecOBJECT_NOT_FOUND");
    expect(error.hash).toBe("H");
    expect(error.message).toContain(OFFER);
  });

  it("maps tecOBJECT_NOT_FOUND on other transactions to NotFoundError", () => {
    expect(errorForResult("tecOBJECT_NOT_FOUND", burn, ACCOUNT)).toBeInstanceOf(NotFoundError);
  });

  it.each([
    ["tecUNFUNDED_PAYMENT", payment, InsufficientFundsError],
    ["tecINSUFFICIENT_FUNDS", accept, InsufficientFundsError],
    ["tecPATH_DRY", payment, InsufficientFundsError],
    ["tecPATH_PARTIAL", payment, InsufficientFundsError],
    ["tecINSUFFICIENT_RESERVE", accept, InsufficientFundsError],
    ["tecNO_LINE", payment, NoTrustLineError],
    ["tecNO_AUTH", payment, NoTrustLineError],
    ["tecNO_PERMISSION", accept, NotAllowedError],
    ["tecCANT_ACCEPT_OWN_NFTOKEN_OFFER", accept, NotAllowedError],
    ["tecNO_ENTRY", burn, NotFoundError],
    ["tecNO_DST", payment, NotFoundError],
    ["tecEXPIRED", accept, OfferExpiredError],
    ["tefMAX_LEDGER", payment, TxExpiredError],
    ["temBAD_AMOUNT", payment, InvalidTransactionError],
    ["temMALFORMED", burn, InvalidTransactionError],
  ] as const)("maps %s to %o", (code, tx, type) => {
    const error = errorForResult(code, tx, ACCOUNT);
    expect(error).toBeInstanceOf(type);
    expect(error.resultCode).toBe(code);
  });

  it("falls back to a TX_FAILED LedgerError that keeps the raw code", () => {
    const error = errorForResult("tecOVERSIZE", burn, ACCOUNT);
    expect(error.constructor).toBe(LedgerError);
    expect(error.code).toBe("TX_FAILED");
    expect(error.resultCode).toBe("tecOVERSIZE");
  });

  it("names the destination for a missing trust line on a payment", () => {
    expect(errorForResult("tecNO_LINE", payment, ACCOUNT).message).toContain(
      "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    );
  });

  it("has no code listed under two errors", () => {
    const all = Object.values(RESULT_CODE_ERRORS).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("resultCode", () => {
  it("reads TransactionResult from the metadata", () => {
    const response = {
      result: { meta: { TransactionResult: "tesSUCCESS" } },
    } as unknown as TxResponse;
    expect(resultCode(response)).toBe("tesSUCCESS");
    expect(resultCode({ result: {} } as unknown as TxResponse)).toBe("unknown");
  });
});
