import { describe, expect, it } from "vitest";
import { Wallet } from "xrpl";
import {
  isValidCurrencyCode,
  loadConfig,
  RLUSD_CURRENCY,
  RLUSD_TESTNET_ISSUER,
} from "../config.js";
import { ConfigError } from "../errors.js";

describe("loadConfig", () => {
  it("uses testnet and RLUSD defaults when nothing is set", () => {
    const config = loadConfig({});
    expect(config).toEqual({
      XRPL_NETWORK_URL: "wss://s.altnet.rippletest.net:51233",
      XRPL_EXPLORER_URL: "https://testnet.xrpl.org",
      XRPL_TOKEN_ISSUER: RLUSD_TESTNET_ISSUER,
      XRPL_TOKEN_CURRENCY: RLUSD_CURRENCY,
      PUBLIC_BASE_URL: "http://localhost:3000",
    });
  });

  it("treats empty strings from a .env file as unset", () => {
    const config = loadConfig({ XRPL_VAULT_SEED: "", XRPL_TOKEN_ISSUER: "", XRPL_NETWORK_URL: "" });
    expect(config.XRPL_VAULT_SEED).toBeUndefined();
    expect(config.XRPL_TOKEN_ISSUER).toBe(RLUSD_TESTNET_ISSUER);
    expect(config.XRPL_NETWORK_URL).toBe("wss://s.altnet.rippletest.net:51233");
  });

  it("accepts a self-issued token override and valid seeds", () => {
    const issuer = Wallet.generate();
    const vault = Wallet.generate();
    const config = loadConfig({
      XRPL_TOKEN_ISSUER: issuer.classicAddress,
      XRPL_TOKEN_CURRENCY: "TST",
      XRPL_VAULT_SEED: vault.seed,
      UNRELATED: "ignored",
    });
    expect(config.XRPL_TOKEN_ISSUER).toBe(issuer.classicAddress);
    expect(config.XRPL_TOKEN_CURRENCY).toBe("TST");
    expect(config.XRPL_VAULT_SEED).toBe(vault.seed);
    expect(config).not.toHaveProperty("UNRELATED");
  });

  it("throws a ConfigError that names every bad variable", () => {
    let error: unknown;
    try {
      loadConfig({
        XRPL_TOKEN_ISSUER: "not-an-address",
        XRPL_AGENT_SEED: "nope",
        XRPL_NETWORK_URL: "not a url",
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as ConfigError).message;
    expect(message).toContain("XRPL_TOKEN_ISSUER");
    expect(message).toContain("XRPL_AGENT_SEED");
    expect(message).toContain("XRPL_NETWORK_URL");
    expect((error as ConfigError).code).toBe("CONFIG");
  });
});

describe("isValidCurrencyCode", () => {
  it.each([
    ["USD", true],
    ["TST", true],
    [RLUSD_CURRENCY, true],
    [RLUSD_CURRENCY.toLowerCase(), true],
    ["XRP", false],
    ["xrp", false],
    ["RLUSD", false],
    ["US", false],
    ["0000000000000000000000005852500000000000", false],
    ["524C5553440000000000000000000000000000", false],
  ])("%s is %s", (code, valid) => {
    expect(isValidCurrencyCode(code)).toBe(valid);
  });
});
