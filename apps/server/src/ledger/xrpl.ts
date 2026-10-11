/**
 * The ONLY file in apps/server allowed to import @agent-pledge/ledger (the crypto teammate's package).
 * Thin adapter: loads the package lazily and checks it exports createXrplLedger.
 */
import type { LedgerPort, XrplLedgerOptions } from "@agent-pledge/shared";
import type { Config } from "../config";

type LedgerModule = { createXrplLedger?: (o: XrplLedgerOptions) => Promise<LedgerPort> };

export async function createXrplLedgerPort(cfg: Config): Promise<LedgerPort> {
  const mod = (await import("@agent-pledge/ledger")) as unknown as LedgerModule;
  if (typeof mod.createXrplLedger !== "function") {
    throw new Error(
      "LEDGER_MODE=xrpl but @agent-pledge/ledger does not export createXrplLedger yet. " +
        "Use LEDGER_MODE=fake until packages/ledger is implemented (issues #3-#10).",
    );
  }
  if (!cfg.VAULT_SEED || !cfg.TREASURY_SEED)
    throw new Error("LEDGER_MODE=xrpl needs VAULT_SEED and TREASURY_SEED");
  return mod.createXrplLedger({
    networkUrl: cfg.XRPL_NETWORK_URL,
    vaultSeed: cfg.VAULT_SEED,
    treasurySeed: cfg.TREASURY_SEED,
    rlusdIssuer: cfg.RLUSD_ISSUER,
    rlusdCurrency: cfg.RLUSD_CURRENCY,
    explorerBaseUrl: cfg.XRPL_EXPLORER_URL,
  });
}
