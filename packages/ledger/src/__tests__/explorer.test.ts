import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { explorerAccountUrl, explorerNftUrl, explorerTxUrl, explorerUrl } from "../explorer.js";

describe("explorer links", () => {
  const config = loadConfig({});

  it("uses the testnet explorer routes", () => {
    expect(explorerTxUrl(config, "AB")).toBe("https://testnet.xrpl.org/transactions/AB");
    expect(explorerAccountUrl(config, "rX")).toBe("https://testnet.xrpl.org/accounts/rX");
    expect(explorerNftUrl(config, "CD")).toBe("https://testnet.xrpl.org/nft/CD");
  });

  it("dispatches by target and strips a trailing slash from the base", () => {
    const slashed = loadConfig({ XRPL_EXPLORER_URL: "https://testnet.xrpl.org/" });
    expect(explorerUrl({ tx: "AB" }, slashed)).toBe("https://testnet.xrpl.org/transactions/AB");
    expect(explorerUrl({ nft: "CD" }, slashed)).toBe("https://testnet.xrpl.org/nft/CD");
    expect(explorerUrl({ account: "rX" }, slashed)).toBe("https://testnet.xrpl.org/accounts/rX");
  });
});
