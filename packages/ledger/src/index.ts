/**
 * @agent-pledge/ledger — STUB.
 *
 * The crypto teammate owns this package (issues #3-#10) and replaces this file.
 *
 * Contract (binding, see packages/shared/src/ledger.ts and docs/api.md):
 * - export `createXrplLedger(options: XrplLedgerOptions): Promise<LedgerPort>`
 *   used by the server (apps/server/src/ledger/xrpl.ts is the only importer).
 * - export `createAgentLedger(options: AgentLedgerOptions): Promise<AgentLedger>`
 *   used by the local agent on the laptop (it signs with its own seed).
 * - throw the typed errors from @agent-pledge/shared (AlreadyClaimedError,
 *   LedgerNetworkError, LedgerTxFailedError).
 */
export const NOT_IMPLEMENTED = true;
