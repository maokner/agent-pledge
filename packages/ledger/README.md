# @agent-pledge/ledger

**Owned by the crypto teammate** (issues #3 to #10). This is a stub from the backend foundation.

The package must implement the interfaces in `packages/shared/src/ledger.ts`:

- `createXrplLedger(options: XrplLedgerOptions): Promise<LedgerPort>` — the server side. The vault signs; the server also signs with the requester and helper seeds that it holds.
- `createAgentLedger(options: AgentLedgerOptions): Promise<AgentLedger>` — the local agent side. The local agent signs on the laptop with its own seed. The server never sees that seed.

The server imports this package only in `apps/server/src/ledger/xrpl.ts` (selected with `LEDGER_MODE=xrpl`).
`apps/server/src/ledger/fake.ts` is an in-memory implementation of the same interface; use it as a reference for the expected behavior (events, errors, idempotency).
See `docs/api.md`, section "Ledger interface and signing protocol".
