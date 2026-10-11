import {
  AlreadyClaimedError as ContractAlreadyClaimedError,
  LedgerNetworkError,
  LedgerTxFailedError,
  TxKind as ContractTxKind,
} from "@agent-pledge/shared";
import { describe, expect, it } from "vitest";
import {
  AlreadyClaimedError,
  LedgerError,
  NetworkError,
  NotFoundError,
  TxExpiredError,
} from "../errors.js";
import { configFromOptions, currencyCode } from "../port.js";
import {
  fromMoney,
  toContractError,
  toContractKind,
  toMoney,
  toMoneyOrUndefined,
} from "../port-map.js";
import type { TxKind } from "../shared-types.js";

describe("money mapping", () => {
  it("converts contract Money to op decimals", () => {
    expect(fromMoney("5.00")).toBe("5");
    expect(fromMoney("0.50")).toBe("0.5");
    expect(fromMoney("12.34")).toBe("12.34");
    expect(fromMoney(" 1.00 ")).toBe("1");
  });

  it("converts op and ledger decimals to Money with two decimals", () => {
    expect(toMoney("5")).toBe("5.00");
    expect(toMoney("0.5")).toBe("0.50");
    expect(toMoney("4.25")).toBe("4.25");
    expect(toMoney("1e-1")).toBe("0.10");
    expect(toMoney("6.000")).toBe("6.00");
    expect(toMoney("0")).toBe("0.00");
  });

  it("refuses values Money cannot hold", () => {
    expect(() => toMoney("0.001")).toThrow(RangeError);
    expect(() => toMoney("abc")).toThrow(RangeError);
    expect(toMoneyOrUndefined("0.001")).toBeUndefined();
    expect(toMoneyOrUndefined(undefined)).toBeUndefined();
  });

  it("round-trips", () => {
    for (const m of ["0.01", "1.00", "4.00", "6.00", "99.99"])
      expect(toMoney(fromMoney(m))).toBe(m);
  });
});

describe("kind mapping", () => {
  const cases: [TxKind | null, string, boolean, string | undefined][] = [
    ["task.fund", "Payment", false, "task_funding"],
    ["task.mint", "NFTokenMint", false, "task_nft_mint"],
    ["task.offer", "NFTokenCreateOffer", false, "task_offer"],
    ["task.claim", "NFTokenAcceptOffer", false, "task_claim"],
    ["subtask.fund", "Payment", true, "subtask_funding"],
    ["subtask.mint", "NFTokenMint", true, "subtask_nft_mint"],
    ["subtask.offer", "NFTokenCreateOffer", true, "subtask_offer"],
    ["subtask.claim", "NFTokenAcceptOffer", true, "subtask_claim"],
    ["payout.offer", "NFTokenCreateOffer", true, "helper_redeem_offer"],
    ["payout.offer", "NFTokenCreateOffer", false, "agent_redeem_offer"],
    ["payout.accept", "NFTokenAcceptOffer", true, "helper_payout"],
    ["payout.accept", "NFTokenAcceptOffer", false, "agent_payout"],
    ["nft.burn", "NFTokenBurn", true, "subtask_nft_burn"],
    ["nft.burn", "NFTokenBurn", false, "task_nft_burn"],
    ["refund", "Payment", true, "refund_agent"],
    ["refund", "Payment", false, "refund_requester"],
    ["token.transfer", "Payment", false, "requester_funding"],
    [null, "TrustSet", false, "wallet_setup"],
    [null, "AccountSet", false, undefined],
  ];
  it.each(cases)("%s (%s, subtask %s) -> %s", (kind, txType, subtask, expected) => {
    expect(toContractKind(kind, txType, { subtask })).toBe(expected);
  });

  it("covers every contract kind", () => {
    const mapped = new Set(cases.map((c) => c[3]).filter(Boolean));
    for (const kind of ContractTxKind.options) expect(mapped).toContain(kind);
  });
});

describe("error mapping", () => {
  it("maps ALREADY_CLAIMED to the contract AlreadyClaimedError with the hash", () => {
    const err = toContractError(
      new AlreadyClaimedError("OFFER", undefined, { hash: "H", resultCode: "tecOBJECT_NOT_FOUND" }),
    );
    expect(err).toBeInstanceOf(ContractAlreadyClaimedError);
    expect((err as ContractAlreadyClaimedError).hash).toBe("H");
    expect((err as ContractAlreadyClaimedError).code).toBe("already_claimed");
  });

  it("maps NETWORK and TX_EXPIRED to LedgerNetworkError", () => {
    expect(toContractError(new NetworkError("down"))).toBeInstanceOf(LedgerNetworkError);
    expect(toContractError(new TxExpiredError("Payment"))).toBeInstanceOf(LedgerNetworkError);
    const conn = Object.assign(new Error("socket"), { name: "NotConnectedError" });
    expect(toContractError(conn)).toBeInstanceOf(LedgerNetworkError);
  });

  it("maps everything else to LedgerTxFailedError with the result code", () => {
    const err = toContractError(
      new NotFoundError("NFT X", undefined, { resultCode: "tecNO_ENTRY", hash: "H" }),
    ) as LedgerTxFailedError;
    expect(err).toBeInstanceOf(LedgerTxFailedError);
    expect(err.resultCode).toBe("tecNO_ENTRY");
    expect(err.hash).toBe("H");
    const plain = toContractError(
      new LedgerError("bad", "FUNDING_MISMATCH"),
    ) as LedgerTxFailedError;
    expect(plain.resultCode).toBe("FUNDING_MISMATCH");
    expect(toContractError(new TypeError("x"))).toBeInstanceOf(LedgerTxFailedError);
  });

  it("passes contract errors through", () => {
    const err = new LedgerTxFailedError("m", "tecX");
    expect(toContractError(err)).toBe(err);
  });
});

describe("config from options", () => {
  it("uses the options, not the environment", () => {
    const config = configFromOptions({
      networkUrl: "wss://example.test:51233",
      rlusdIssuer: "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV",
      rlusdCurrency: "524C555344000000000000000000000000000000",
      explorerBaseUrl: "https://explorer.test",
    });
    expect(config.XRPL_NETWORK_URL).toBe("wss://example.test:51233");
    expect(config.XRPL_EXPLORER_URL).toBe("https://explorer.test");
  });

  it("hex-encodes a long currency code", () => {
    expect(currencyCode("RLUSD")).toBe("524C555344000000000000000000000000000000");
    expect(currencyCode("USD")).toBe("USD");
  });
});
