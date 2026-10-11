import type { AgentLedger, LedgerPort } from "@agent-pledge/shared";
import type { Config } from "../config";
import { FakeLedger } from "./fake";

/**
 * What the server holds. Use `port` for every ledger call.
 * `fakeAgent` is non-null only in fake mode: routes use it to perform the local agent's step
 * when the agent omits tx_hash (see docs/api.md, signing protocol).
 */
export interface LedgerHandle {
  mode: "fake" | "xrpl";
  port: LedgerPort;
  fakeAgent: AgentLedger | null;
  /** The local agent's address: AGENT_ADDRESS, or the fake ledger's agent account. */
  agentAddress: string;
  vaultAddress: string;
  /** Set in fake mode, for tests (balances etc.). */
  fake: FakeLedger | null;
}

export function fakeLedgerHandle(fake: FakeLedger): LedgerHandle {
  return {
    mode: "fake",
    port: fake,
    fakeAgent: fake.agent,
    agentAddress: fake.agentAddress,
    vaultAddress: fake.vaultAddress,
    fake,
  };
}

export async function createLedger(cfg: Config): Promise<LedgerHandle> {
  if (cfg.LEDGER_MODE === "fake") {
    return fakeLedgerHandle(
      new FakeLedger({
        latencyMs: cfg.FAKE_LEDGER_LATENCY_MS,
        agentAddress: cfg.AGENT_ADDRESS || undefined,
        agentBalance: cfg.FAKE_AGENT_BALANCE,
        explorerBaseUrl: cfg.XRPL_EXPLORER_URL,
      }),
    );
  }
  const { createXrplLedgerPort } = await import("./xrpl");
  const port = await createXrplLedgerPort(cfg);
  return {
    mode: "xrpl",
    port,
    fakeAgent: null,
    agentAddress: cfg.AGENT_ADDRESS!,
    vaultAddress: port.vaultAddress,
    fake: null,
  };
}

export { FakeLedger };
