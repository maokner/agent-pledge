import type { AgentLedger, AgentLedgerOptions } from "@agent-pledge/shared";
import type { AgentConfig } from "./config";

/**
 * The agent's own ledger (docs/api.md section 6).
 * - fake mode: returns null. The agent calls the server without tx hashes and the server performs the
 *   agent's ledger step with its FakeLedger agent account.
 * - xrpl mode: loads createAgentLedger from @agent-pledge/ledger and signs on this laptop with AGENT_SEED.
 *   The seed never leaves the laptop.
 */
export async function createLedger(config: AgentConfig): Promise<AgentLedger | null> {
  if (config.ledgerMode === "fake") return null;
  if (!config.agentSeed)
    throw new Error("LEDGER_MODE=xrpl needs AGENT_SEED (the agent's own seed)");
  if (!config.vaultAddress) throw new Error("LEDGER_MODE=xrpl needs VAULT_ADDRESS");

  let mod: Record<string, unknown>;
  try {
    mod = (await import("@agent-pledge/ledger")) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `LEDGER_MODE=xrpl but @agent-pledge/ledger could not be loaded (${(err as Error).message}). ` +
        "Use LEDGER_MODE=fake until packages/ledger is built.",
    );
  }
  const create = mod.createAgentLedger;
  if (typeof create !== "function") {
    throw new Error(
      "LEDGER_MODE=xrpl but @agent-pledge/ledger does not export createAgentLedger yet " +
        "(the crypto teammate is still building it). Use LEDGER_MODE=fake for now.",
    );
  }
  const options: AgentLedgerOptions = {
    networkUrl: config.xrplNetworkUrl,
    agentSeed: config.agentSeed,
    vaultAddress: config.vaultAddress,
    rlusdIssuer: config.rlusdIssuer,
    rlusdCurrency: config.rlusdCurrency,
    explorerBaseUrl: config.xrplExplorerUrl,
  };
  return (await (create as (o: AgentLedgerOptions) => Promise<AgentLedger>)(
    options,
  )) as AgentLedger;
}
