# Web app contract (DRAFT, internal model)

> **Status: the web app's internal model, not the server contract.**
> The binding server contract is `packages/shared` (`@agent-pledge/shared`, zod schemas) and `docs/api.md`.
> The front end wrote these types before the server existed, so the board and claim page (#31) could start early.
> They used to live in `packages/shared`; since the frontend and backend branches merged they live here, in `apps/web/lib/contract`, and the app imports them as `@/lib/contract`.
> The web app maps the server's shapes into them in one adapter, `apps/web/lib/backend/` (see "The real server" below and `docs/integration/backend-reconciliation.md`).
> `apps/web/lib/backend/types.ts` takes the server's types straight from `@agent-pledge/shared`.

The types in this folder are the source of truth for the web app's model.
This page explains the choices.
Changes made for the real server are additive and marked "real server".

## Conventions

- JSON with `snake_case` keys, as in the PRD (`time_limit_minutes`, `parent_nft_id`).
- RLUSD amounts are decimal strings (`"5"`, `"4.5"`), never floats. The UI shows them as dollars.
  Exception: `create_task.price_usd` is a JSON number, because the voice agent sends it.
- Times are ISO 8601 UTC strings.
- Responses carry whole objects (`Task`, `Subtask`, `LedgerTx`), not diffs, so clients replace by ID.
  The real server's socket events are patches; the web app's adapter turns them into whole objects.
- Errors are `{ error: ApiErrorCode, message }` with the HTTP status listed in `http.ts`.
- Files import siblings with `.ts` extensions, so Node 24 can run them with type stripping (no build step).
  Next.js compiles the package via `transpilePackages`.

## Statuses

- Task and sub-task: `open | claimed | done | failed` (PRD 9.1).
  A locked PIN is `pin_locked: true` on the sub-task. The sub-task stays `claimed` until the task fails.
- Transaction: `pending | validated | failed`. `hash` is the key; the same hash moves from pending to validated.
- Claim page, from the asking phone's view: `open | claimed_by_you | already_claimed | expired | locked | paying | paid`.

## HTTP endpoints

| Who | Endpoint | Body | Response |
|---|---|---|---|
| Voice | `POST /tools/create_task` | `CreateTaskRequest` | `CreateTaskResponse` |
| Voice | `GET /tools/task_status/:taskId` | | `TaskStatusResponse` |
| Agent | `GET /agent/tasks/:id` | | `AgentTaskResponse` |
| Agent | `POST /agent/tasks/:id/claim` | `ClaimTaskRequest` | `ClaimTaskResponse` |
| Agent | `POST /agent/tasks/:id/subtasks` | `CreateSubtaskRequest` | `CreateSubtaskResponse` |
| Agent | `POST /agent/tasks/:id/redeem` | `RedeemTaskRequest` | `RedeemTaskResponse` |
| Agent | `POST /agent/subtasks/:id/screenshot` | multipart `screenshot`, `post_text` | `UploadScreenshotResponse` |
| Agent | `POST /agent/log` | `AgentLogRequest` | `AgentLogResponse` |
| Helper | `GET /claim/:code` | | `ClaimView` |
| Helper | `POST /claim/:code/claim` | none | `ClaimView` (409 `already_claimed`). Real server: `{ helper_token, claim }` |
| Helper | `POST /claim/:code/photo` | multipart `photo`, `note`. Real server: `file`, at most 8 MB | `ClaimView`. Real server: `{ claim, media }` |
| Helper | `POST /claim/:code/pin` | `SubmitPinRequest` | `SubmitPinResponse` (always 200 for a well-formed PIN). Real server: 422 `wrong_pin` / 423 `pin_locked` |
| Public | `GET /subtasks/open` (**DRAFT, new; not on the real server**) | | `ListOpenSubtasksResponse` |
| Public | `GET /board/state` | | `BoardSnapshot` |
| Public | `GET /tasks/:id.json` | | `TaskNftData` (`:id` is a task or sub-task ID) |

`apiPaths` in `http.ts` builds these paths.

Auth: voice tools send `x-agent-pledge-secret`; the local agent sends `Authorization: Bearer <token>`;
the claim page relies on the signed `ap_helper` cookie set by `POST /claim/:code/claim`.
Real server: the claim response carries a `helper_token` (also set as cookie `ap_helper_<CODE>`); the web app keeps
it per code in localStorage and sends it as `x-helper-token` (`HELPER_TOKEN_HEADER`), since the claim page and the
API are on different origins.

## Open sub-tasks (DRAFT, new in the restyle)

> **For the backend person (#17):** this endpoint is new. The front end added it for the `/human` list
> (DIRECTION.md), and nothing listed open sub-tasks before. It needs your sign-off before anyone relies on it.

**Today the web app derives this list itself.** The real server has no such endpoint, so
`ApiClient.listOpenSubtasks()` reads `GET /board/state` and keeps the sub-tasks with status `open`, an `offer_id`
(the vault's offer exists; before that a claim gets 409 `conflict`) and a deadline after the board's
`generated_at`, which stands in for `server_time`. Description, place and time limit come from the parent task.
The endpoint below stays the proposal for when the server adds one.

`GET /subtasks/open`, public, no auth. Returns `ListOpenSubtasksResponse`:

```ts
interface ListOpenSubtasksResponse {
  server_time: IsoDateTime; // so countdowns are right even if the phone clock is off
  subtasks: OpenSubtaskSummary[];
}
interface OpenSubtaskSummary {
  claim_code: ClaimCode; // the item opens /c/<claim_code>
  price: RlusdAmount; // what the helper gets, for example "4.5"
  description: string; // what to do
  place: string;
  time_limit_minutes: number;
  created_at: IsoDateTime;
  deadline_at: IsoDateTime;
}
```

- **Which sub-tasks:** status `open` and `deadline_at` after `server_time`. Order is not guaranteed;
  the web app sorts (soonest deadline first) and drops anything that expires while the page is open.
- **No crypto fields** (NFT IDs, addresses, hashes): the human side never shows them (PRD R7).
- **Path:** not under `/claim/`, where `/claim/:code` would collide with it (the fixture code `OPEN` makes
  that real). `apiPaths.openSubtasks()` builds it.
- **Keeping the list fresh (proposal):** the page polls this endpoint (every 10 to 15 seconds) and refetches
  at once when the board socket sends `subtask.created`, `subtask.claimed` or `task.failed`, and when the
  tab becomes visible again. Polling alone is enough if the human page should not open the board socket.

## WebSocket

Board: `GET /ws/board?since=<seq>`, public.

- Every board event has `seq`: one server-wide counter, starting at 1, increasing by exactly 1, never reused.
- On connect, the server sends every event with `seq > since`, in order.
  If it cannot (history trimmed, or `since` missing), it first sends `{ type: "board.snapshot", snapshot }`,
  where `snapshot.seq` is the last event the snapshot includes, then live events.
- A client ignores events with `seq <=` its last seq. On a gap it reconnects with `since =` its last seq.

Events: `task.created`, `task.claimed`, `subtask.created`, `subtask.claimed`, `tx.pending`, `tx.validated`,
`tx.failed`, `photo.added`, `yikyak.posted`, `pin.failed`, `pin.locked`, `subtask.paid`, `task.paid`, `task.failed`,
`agent.log`. Each is `{ type, seq, at, data }`; see `events.ts` for each `data`.
A client skips an event type it does not know, but still counts its `seq`, so it does not look like a gap.

Real server: the snapshot is `{ type: "snapshot", seq, state }` with its nested `BoardState`; `seq` starts at the
server's boot time in ms and jumps after a restart, when the server sends a snapshot. The web app treats any
snapshot as a reset.

Agent: `GET /ws/agent` with the Bearer token. The server sends `{ type: "task.new", data: { task } }`.

## Open questions for the backend review

1. **Local agent signing.** The PRD says the local agent holds its own key. This draft has the agent sign
   its own transactions and send signed blobs (`signed_tx_blob`, `signed_payment_blob`, `signed_offer_blob`).
   The alternative is that the server signs for the agent.
2. **`tx.validated` carries the changed task or sub-task** (for example `nft_id` after a mint), because
   no listed event would carry it otherwise.
3. **`subtask.created` also carries the parent task**, whose `subtask_ids` changed.
4. **`task.paid` and `task.failed` carry the final sub-tasks.** There is no `subtask.paid` or `subtask.failed` event.
5. **The backup web form (#38)** cannot send the voice secret from a browser. The web app answers this with a
   server-side proxy route (`POST /api/backup-task` in `apps/web`, gated by an operator passcode) that calls
   `POST /tools/create_task` with the secret, so the server needs no new endpoint. `caller_phone` is optional
   (the real server accepts none), so the form sends no placeholder.
6. **Explorer links** default to `https://testnet.xrpl.org/{transactions|accounts|nft}/<id>` in the web app.
   Confirm against the ledger package (#10).
7. **Open sub-task list (`GET /subtasks/open`, DRAFT, new).** Are the shape and path above OK? Should the list
   only include sub-tasks a helper can claim right now (NFT minted and the vault's offer created), or every
   `open` one? Is polling plus a refetch on board events the right way to keep it fresh, or should there be
   a dedicated event or socket for the human side? Does it need a cap on items or rate limiting?

## The real server (`origin/backend-all`)

The web app maps the real server into these types in `apps/web/lib/backend/`. To carry what the server sends,
these types grew, additively:

- `TxKind`: `wallet_setup`, `requester_funding`. `XrplTxType`: `TrustSet`.
  The server's other kinds are renamed: `task_funding` -> `task_escrow`, `task_offer` -> `task_nft_offer`,
  `subtask_funding` -> `subtask_escrow`, `subtask_offer` -> `subtask_nft_offer`, `helper_redeem_offer` ->
  `helper_payout_offer`, `agent_redeem_offer` -> `agent_payout_offer`, `task_nft_burn` / `subtask_nft_burn` ->
  `nft_burn`, `refund_requester` -> `requester_refund`, `refund_agent` -> `agent_refund`. The server sends no
  XRPL transaction type, engine result or ledger index; the adapter derives the type from the kind.
- `LedgerTx`: optional `explorer_url`, `currency`, `error`. `Task`: optional `fail_reason` (the server's free text;
  `failure_reason` is the closest enum value or null) and `nft_explorer_url`. `Subtask`: optional `nft_explorer_url`.
  `Photo`: optional `width`, `height` (`MediaView`).
- Events: `tx.failed` and `subtask.paid`; task events may carry `subtasks` and `txs` (the server sends the whole
  task with both), `task.paid` / `task.failed` may carry `txs`.
- `ApiErrorCode`: `conflict`, `wrong_pin`, `not_seat_hold`, `payload_too_large`, `not_implemented`
  (`pin_locked` maps to `locked`, a 401 on a claim-page call to `not_your_claim`).
- `CreateTaskRequest.caller_phone` is optional; `CreateTaskResponse` may carry `status`, `price`, `deadline_at`.
- `ClaimView.payout` may carry `explorer_url`. `server_time` is the phone's clock until the server sends one.
- `TaskNftData`: `time_limit_minutes` and `created_at` may be null (the server sends neither); optional
  `deadline_at`, `status`, `nft_id`.
- Agent log IDs stay strings: the server's numeric IDs are converted.
- `HELPER_TOKEN_HEADER` (`x-helper-token`).

Claim codes on the real server use `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0, O, 1, I or L), case-insensitive.
The fixture codes (`OPEN`, `LOCK`, …) do not follow that alphabet; fixture mode never talks to the server.
