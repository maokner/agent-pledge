# Agent Pledge API and WebSocket contract

Status: binding (issues #16, #17, #18). The source of truth for every shape is `packages/shared/src`
(zod schemas plus inferred TypeScript types). This document explains them. If they disagree, the code wins; fix the doc.

| Module | What it holds |
|---|---|
| `packages/shared/src/money.ts` | `Money` ("5.00"), `toCents`, `fromCents`, `normalizeMoney`, `subtaskPriceCents` |
| `packages/shared/src/ids.ts` | `newId(prefix)`, `newCode()`, `normalizeCode()`, `CODE_ALPHABET` |
| `packages/shared/src/domain.ts` | Enums: `TaskStatus`, `SubtaskStatus`, `WalletRole`, `TxStatus`, `TxKind`, `MediaKind`, `AgentLogLevel`, `PIN_MAX_ATTEMPTS` |
| `packages/shared/src/views.ts` | `BoardState`, `TaskView`, `SubtaskView`, `TxView`, `MediaView`, `PinState`, `AgentLogEntry`, `ClaimView`, `NftUriData` |
| `packages/shared/src/api.ts` | Request/response schemas for every HTTP endpoint, `ApiError`, `ErrorCode` |
| `packages/shared/src/events.ts` | Board WebSocket events (`BoardEvent`, `BoardEventDataSchemas`, `BoardSnapshotMessage`) |
| `packages/shared/src/agent-ws.ts` | Local agent WebSocket messages (`AgentTask`, `task.new`, `task.redeemable`, `hello`, `ack`) |
| `packages/shared/src/ledger.ts` | `LedgerPort`, `AgentLedger`, `TxEvent`, typed errors, explorer URL helpers |

## 1. Conventions

- JSON field names are `snake_case`. Nullable fields are always present with `null`.
- Money is a string with 2 decimals in RLUSD, for example `"5.00"`. The database stores integer cents.
- Times are ISO 8601 strings in UTC.
- IDs: `task_<16 chars>`, `sub_<16 chars>`, `wal_…`, `med_…`. Transactions are keyed by their 64-hex ledger hash.
- Claim codes and board codes: 4 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L).
  Claim link: `<PUBLIC_BASE_URL>/c/<CODE>`. Codes are case-insensitive in URLs (normalize with `normalizeCode`).
- `PUBLIC_BASE_URL` is the web app (board and claim page). `PUBLIC_API_URL` is this server. NFT URIs and media URLs use `PUBLIC_API_URL`.
- Errors: `{ "error": "<code>", "message": "<text>", "details"?: ... }` with these codes:

| HTTP | `error` | When |
|---|---|---|
| 400 | `bad_request` | Body or params fail the zod schema (`details` lists the issues) |
| 401 | `unauthorized` | Missing or wrong secret / token |
| 404 | `not_found` | Unknown task, sub-task, code, or media |
| 409 | `already_claimed` | Someone claimed the offer first (ledger `AlreadyClaimedError`) |
| 409 | `conflict` | Wrong state for this action (for example claim a task twice) |
| 410 | `expired` | Deadline passed, or the task/sub-task failed |
| 422 | `wrong_pin` | Wrong PIN; `details: { attempts, attempts_left }` |
| 422 | `not_seat_hold` | `create_task` for something that is not a seat hold |
| 423 | `pin_locked` | Three wrong PINs; `details: { attempts, attempts_left: 0 }` |
| 501 | `not_implemented` | Stub not built yet |
| 502 | `ledger_error` | Ledger network error or failed transaction |

## 2. Auth

| Caller | How | Server helper (`apps/server/src/auth.ts`) |
|---|---|---|
| Voice agent (ElevenLabs) | Header `x-agent-pledge-secret: <VOICE_SHARED_SECRET>` | `requireVoiceSecret` |
| Local agent | Header `Authorization: Bearer <AGENT_TOKEN>`; on `/ws/agent` also `?token=<AGENT_TOKEN>` | `requireAgentToken`, `hasAgentToken` |
| Admin | Same as the local agent | `requireAgentToken` |
| Helper (claim page) | Helper token from `POST /claim/:code/claim`. Returned in the JSON body (`helper_token`) AND set as a signed, httpOnly cookie `ap_helper_<CODE>`. Send it back as the cookie, `Authorization: Bearer <token>`, or `x-helper-token: <token>`. | `issueHelperToken`, `setHelperCookie`, `getHelperToken`, `verifyHelperToken`, `helperFromRequest`, `requireHelper` |
| Board | Public, read-only | none |

The helper token is HMAC-signed with `COOKIE_SECRET` and bound to one sub-task (`{ sid, wid, iat }`); a token for one sub-task is rejected for another.
The claim page may run on a different origin than the API, so the cookie is `SameSite=None; Secure` when `PUBLIC_API_URL` is https, and CORS allows credentials for `CORS_ORIGINS`.
Cross-origin front ends should prefer storing `helper_token` (for example in `localStorage`) and sending the header.

## 3. HTTP endpoints

### 3.1 Voice agent tools (PRD 6)

**`POST /tools/create_task`** (voice secret) — body `CreateTaskRequest`:

```json
{ "description": "Save me a seat at the front table", "place": "Main Stacks", "time_limit_minutes": 3, "price_usd": 5, "caller_phone": "+15105550123" }
```

`price_usd` may be a number or a string (`5`, `"5"`, `"5.00"`, `"$5"`); the server normalizes it.
The server rejects non-seat-holds with 422 `not_seat_hold`. It generates a 4-digit PIN (stores only the hash), makes and funds a requester wallet, pays the price into the vault, mints the task NFT, creates the offer to the agent, broadcasts `task.created` and the `tx.*` events, and pushes `task.new` to the local agent.
Response `CreateTaskResponse`: `{ task_id, pin, board_url, status, price, deadline }`. The PIN appears only here.

**`GET /tools/task_status/:taskId`** (voice secret) → `TaskStatusResponse`: `{ task_id, status, helper_note, deadline, price }`.

### 3.2 Local agent (PRD 7.2)

All with `Authorization: Bearer <AGENT_TOKEN>`. See section 6 for the signing protocol.

| Endpoint | Body | Response | Board events |
|---|---|---|---|
| `POST /agent/tasks/:id/claim` | `ClaimTaskRequest { tx_hash? }` | `{ task: TaskView }` | `task.claimed`, `tx.*` |
| `POST /agent/tasks/:id/subtasks` | `CreateSubtaskRequest { price, subtask_id?, funding_tx_hash?, deadline? }` | `{ subtask, claim_url, claim_code }` | `subtask.created`, `tx.*` |
| `GET /agent/tasks/:id` | — | `TaskView` | — |
| `POST /agent/tasks/:id/redeem` | `RedeemTaskRequest { offer_id?, tx_hash? }` | `{ task, amount, payout_tx_hash, explorer_url }` | `task.paid`, `tx.*` |
| `POST /agent/subtasks/:id/screenshot` | multipart: `file` (image), `post_text`, `posted_at?` | `{ media, subtask }` | `yikyak.posted` |
| `POST /agent/log` | `AgentLogRequest { message, task_id?, subtask_id?, level? }` | `{ entry }` | `agent.log` |

Sub-task creation: `price` is what the helper earns. The server funds nothing itself in xrpl mode; the agent pays the vault (see section 6). Sub-task deadline defaults to the task deadline.

### 3.3 Claim page (PRD 9.2)

| Endpoint | Auth | Body | Response | Errors | Board events |
|---|---|---|---|---|---|
| `GET /claim/:code` | none (helper token optional, sets `claimed_by_you`) | — | `ClaimView` | 404 | — |
| `POST /claim/:code/claim` | none | — | `{ helper_token, claim: ClaimView }` + cookie | 409 `already_claimed`, 410 `expired` | `subtask.claimed`, `tx.*` |
| `POST /claim/:code/photo` | helper | multipart: `file?` (image), `note?` (≤280 chars); at least one | `{ claim, media }` | 401, 410 | `photo.added` |
| `POST /claim/:code/pin` | helper | `{ pin: "4821" }` | `{ claim, payout: { amount, tx_hash, explorer_url } }` | 422 `wrong_pin`, 423 `pin_locked`, 410 | `pin.failed`, `pin.locked`, `subtask.paid`, `tx.*` |

The PIN endpoint is idempotent: a repeat after success returns the same payout and pays nothing twice.
After the helper is paid, the server sends `task.redeemable` to the local agent, which redeems the task NFT (section 6); `task.paid` follows.

### 3.4 Board, NFT data, media, admin

| Endpoint | Auth | Response |
|---|---|---|
| `GET /board/state` | none | `BoardState` (all tasks newest first, each with sub-tasks, transactions, media, PIN state; agent log newest 200; `seq`) |
| `GET /tasks/:id.json` | none | `NftUriData` for a task ID **or** a sub-task ID. Sub-tasks include `parent_task_id` and `parent_nft_id` (PRD 5.3). This is the NFT `URI` target: `<PUBLIC_API_URL>/tasks/<id>.json`. |
| `GET /media/:id` | none | The image bytes with their `Content-Type`; immutable, cacheable |
| `POST /admin/tasks/:id/fail` | agent token | `AdminFailRequest { reason? }` → `{ task }`; runs the failure flow (idempotent) |
| `GET /health` | none | `{ ok: true, ledger_mode, time }` |

PIN state in every view is `{ attempts, attempts_left, locked, verified }`. The PIN and its hash never leave the server.

## 4. Board WebSocket: `/ws/board`

Public, read-only. Every event is an envelope:

```json
{ "seq": 1760212800123, "type": "task.created", "at": "2026-10-11T18:00:00.000Z", "data": { "task": { "...": "TaskView" } } }
```

- `seq` increases by 1 per event. It starts at the server boot time in ms, so it keeps increasing across restarts but is not contiguous across them.
- On connect without `since`, the server sends `{ "type": "snapshot", "seq": N, "state": BoardState }` and then live events.
- To resume, connect with `/ws/board?since=<last seq>`. The server replays the missed events from its ring buffer (~1000 events), or sends a `snapshot` when the client is too far behind or the seq is unknown (for example after a restart).
- Clients upsert by ID. Task events carry the full `TaskView` (with sub-tasks and transactions), sub-task events the full `SubtaskView`, tx events the full `TxView`.

| `type` | `data` |
|---|---|
| `task.created` | `{ task: TaskView }` |
| `task.claimed` | `{ task: TaskView }` |
| `subtask.created` | `{ subtask: SubtaskView }` |
| `subtask.claimed` | `{ subtask: SubtaskView }` |
| `tx.pending` | `{ tx: TxView }` |
| `tx.validated` | `{ tx: TxView }` |
| `tx.failed` | `{ tx: TxView }` |
| `photo.added` | `{ task_id, subtask_id, media: MediaView \| null, helper_note }` |
| `yikyak.posted` | `{ task_id, subtask_id, media: MediaView, post_text, posted_at }` |
| `pin.failed` | `{ task_id, subtask_id, attempts, attempts_left }` |
| `pin.locked` | `{ task_id, subtask_id, attempts }` |
| `subtask.paid` | `{ subtask: SubtaskView, amount, tx_hash, explorer_url }` |
| `task.paid` | `{ task: TaskView, amount, tx_hash, explorer_url }` |
| `task.failed` | `{ task: TaskView, reason }` |
| `agent.log` | `{ entry: AgentLogEntry }` |

The `tx.*` events come for free: the server bridges every ledger `TxEvent` into the `transactions` table and these events (`apps/server/src/events/ledger-bridge.ts`).

## 5. Local agent WebSocket: `/ws/agent`

Outbound from the laptop, so the laptop needs no public address. Auth: `Authorization: Bearer <AGENT_TOKEN>` on the upgrade request (or `?token=`).

Server → agent:

| `type` | Fields | Notes |
|---|---|---|
| `task.new` | `task: AgentTask` (`id, description, place, time_limit_minutes, deadline, price, pledge, status, nft_id, offer_id, vault_address, board_url, created_at`) | Resent on every (re)connect until acked |
| `task.redeemable` | `task_id, subtask_id, nft_id, amount, vault_address` | The helper entered the correct PIN and was paid. `amount` = price + pledge. Resent on reconnect while the task is redeemable and unpaid. |

Agent → server:

| `type` | Fields |
|---|---|
| `hello` | `agent_address?, version?` (send right after connecting) |
| `ack` | `task_id` — sets `tasks.agent_acked_at`; stops resends of `task.new` |

## 6. Ledger interface and signing protocol

The ledger package (`packages/ledger`, owned by the crypto teammate) implements the interfaces in `packages/shared/src/ledger.ts`:

- `createXrplLedger(options: XrplLedgerOptions): Promise<LedgerPort>` — server side.
- `createAgentLedger(options: AgentLedgerOptions): Promise<AgentLedger>` — laptop side.

In the server, only `apps/server/src/ledger/xrpl.ts` imports `@agent-pledge/ledger`. `apps/server/src/ledger/index.ts` picks the implementation by `LEDGER_MODE` (`fake` default, `xrpl`). `apps/server/src/ledger/fake.ts` is a full in-memory `FakeLedger` and is the reference behavior.

**Behavior of every submitting call:** emit a `pending` `TxEvent` (via `onTx`) when submitted; resolve only after validation (so NFT IDs and offer IDs are known), emitting `validated`; or emit `failed` and throw a typed error.
`TxEvent = { hash, status: "pending" | "validated" | "failed", kind, taskId?, subtaskId?, amount?, currency?, from?, to?, memo?, nftId?, offerId?, explorerUrl, error? }`.

**Errors:** `AlreadyClaimedError` (offer gone; HTTP 409), `LedgerNetworkError` (retry; HTTP 502), `LedgerTxFailedError` (tec/tem code or verify mismatch; HTTP 502).

**`LedgerPort` (server; vault plus server-held requester/helper seeds):**

| Method | Tx kind | PRD 5.4 step |
|---|---|---|
| `createWallet(role)` → `{ role, address, seed }` | `wallet_setup` | 5.1 |
| `fundRequester(address, amount, ctx?)` | `requester_funding` | demo treasury → requester |
| `fundTask(requesterSeed, taskId, amount)` | `task_funding` | 5. Money escrow |
| `mintTaskNft(taskId, uri)` → `nftId` | `task_nft_mint` | 5. Task NFT |
| `offerTaskToAgent(nftId, pledge, agentAddress, taskId)` → `offerId` | `task_offer` | 7. Offer |
| `acceptOffer(claimerSeed, offerId, ctx)` → `{ nftId, holder }` | `subtask_claim` (or `task_claim`) | 10. Helper claim |
| `mintSubtaskNft(subtaskId, uri)` → `nftId` | `subtask_nft_mint` | 8. Sub-task NFT |
| `offerSubtaskToAnyone(nftId, subtaskId)` → `offerId` | `subtask_offer` | 8. Open offer |
| `createRedeemOffer(holderSeed, nftId, amount, ctx)` → `offerId` | `helper_redeem_offer` | 13. Helper payout (offer) |
| `acceptRedeemOffer(offerId, ctx)` | `helper_payout` / `agent_payout` | 13. Payout swap |
| `burn(nftId, ctx)` | `subtask_nft_burn` / `task_nft_burn` | 13. Close |
| `failTask(FailTaskInput)` | burns + `refund_requester` + `refund_agent` | Failure (PRD 2.3); idempotent per task |
| `verifyTx(hash, expect)` | — | Checks a transaction the local agent submitted; emits its `validated`/`failed` event |
| `explorerTxUrl(hash)`, `explorerNftUrl(nftId)` | — | `https://testnet.xrpl.org/transactions/<hash>`, `/nft/<id>` |

**`AgentLedger` (laptop; the agent's own seed, never sent to the server):** `acceptOffer(offerId)` (`task_claim`: claim + pledge), `fundSubtask(subtaskRef, amount)` (`subtask_funding`: agent → vault, memo = sub-task ID), `createRedeemOffer(nftId, amount)` (`agent_redeem_offer`).

**Signing protocol (decision for #20):** the local agent signs and submits its own transactions on the laptop with `AgentLedger`, then calls the server with the hash. The server verifies with `verifyTx` and continues with the vault-signed steps.

| Step | Agent does (laptop) | Then calls | Server verifies (`verifyTx` expect) | Server then |
|---|---|---|---|---|
| Claim | `acceptOffer(task.offer_id)` | `POST /agent/tasks/:id/claim { tx_hash }` | `task_claim`, `offerId`, `from` = agent | marks claimed, `task.claimed` |
| Sub-task | `id = newId("sub")`; `fundSubtask(id, price)` | `POST /agent/tasks/:id/subtasks { subtask_id: id, price, funding_tx_hash }` | `subtask_funding`, `from` = agent, `to` = vault, `amount` = price, `memo` ∋ id | mints sub-task NFT, open offer, `subtask.created` |
| Redeem (after `task.redeemable`) | `createRedeemOffer(nft_id, amount)` | `POST /agent/tasks/:id/redeem { offer_id, tx_hash }` | `agent_redeem_offer`, `nftId`, `amount` = price + pledge | `acceptRedeemOffer`, `burn`, `task.paid` |

When `LEDGER_MODE=fake` and the agent omits `tx_hash` / `funding_tx_hash` / `offer_id`, the server performs the agent's step itself with `app.ledger.fakeAgent` (the FakeLedger's agent account), so the whole flow runs without XRPL.
In xrpl mode a missing hash is a 400.

## 7. Database (FROZEN)

Drizzle ORM, Postgres dialect, one schema (`apps/server/src/db/schema.ts`), one migration folder (`apps/server/drizzle`), migrations at server startup.
Production: node-postgres when `DATABASE_URL` is `postgres://…`. Local dev: PGlite on disk (`pglite://.data/pglite`). Tests: in-memory PGlite (`memory://`).
Tables: `tasks`, `subtasks`, `wallets`, `transactions`, `pins`, `media` (bytes in `bytea`), `agent_log`. Money columns are integer cents (`*_cents`).
Idempotency markers: `tasks.payout_started_at / paid_at / refund_started_at / refunded_at`, `subtasks.claim_started_at / payout_started_at / paid_at / burned_at`. Claim a marker with a conditional `UPDATE … WHERE <marker> IS NULL RETURNING` before calling the ledger.
Wallet seeds for requesters and helpers are AES-256-GCM encrypted with `SEED_ENCRYPTION_KEY` (`apps/server/src/lib/seed-crypto.ts`). The agent's seed is never stored on the server; the vault seed lives only in env.
Do not change the schema in parallel branches.
