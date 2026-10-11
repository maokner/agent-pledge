# Frontend vs. backend: reconciliation

Compared on 2026-10-11:
- local `frontend`: the web app plus the frontend's DRAFT `packages/shared`
- `origin/backend-all` (server and local agent)
- `origin/crypto-voice` (voice agent and ledger)

The binding contract is the backend's `docs/api.md` (issues #16, #17, #18). None of the open issues have comments, and there are no PRs, so nothing else has been agreed.

Refs are `branch:path:line`. `fe` = `frontend`, `be` = `origin/backend-all`, `cv` = `origin/crypto-voice`.

## Status (2026-10-11)

The frontend side is done. `apps/web/lib/backend/` adapts the real server's shapes, mirrored from `origin/backend-all` at 52c72be, into the web app's own types. It was checked end to end against the real server with `LEDGER_MODE=fake`: a task created, the claim, photo, a wrong PIN, the right PIN, the payout, a deadline failure and a server restart. Everything in "Frontend work" below is done. What's left is the open questions for the backend person; until they're answered, the client works around them, as described in `apps/web/lib/contract/CONTRACT.md` (formerly `packages/shared/CONTRACT.md`) under "The real server".

## Merged (2026-10-11)

The `frontend` branch is merged with the backend on the `integration` branch.
`packages/shared` is the backend's zod package; the frontend's DRAFT types moved to `apps/web/lib/contract`.
`apps/web/lib/backend/types.ts` now takes the server's types from `@agent-pledge/shared`.
The Next.js app replaces the server's static pages, and the server reverse-proxies every non-API path to it (`WEB_UPSTREAM_URL`), so the pages, the API and `/ws/board` share one origin.
Workspace: pnpm 10.33.0, Node 22, and `sharp` is built (open question 8).
The tables below are the state before the merge.

## Summary

- **Contracts:** the backend built its own zod-based `packages/shared`. It did not adopt the frontend's DRAFT. `cv` has a third, types-only variant.
- **What agrees:**
  - the endpoint paths and the WebSocket path
  - the event envelope `{seq,type,at,data}`
  - snake_case and ISO UTC times
  - the status enums
  - the `already_claimed` and `expired` errors
  - the voice secret header the backup form proxy sends
  - the explorer URL format
  - the `/c/<CODE>` claim link
- **What differs:** nearly every payload shape, listed in the tables below.
- **The board crashes against the real server today:**
  - `fe:apps/web/lib/board/state.ts:61-84` has no `default` branch, so an unknown event (`tx.failed`, `subtask.paid`) returns `undefined` and `sync.ts:83-87` throws.
  - The server's snapshot message is `{type:"snapshot"}`, which the frontend doesn't recognise. It falls into the seq-gap check and reconnects in a loop.
- **Only seat holds exist:**
  - The server rejects anything else with 422 `not_seat_hold` (`be:apps/server/src/services/tasks.ts:77-112`), and the voice agent refuses it.
  - There is no task `kind`, no proof type, and no sub-task description or place.

## Mismatches

### Types (`packages/shared`)

| Area | Frontend expects | Backend does | Resolution |
|---|---|---|---|
| Package | `fe:packages/shared` (no deps) | zod schemas plus types (`be:packages/shared/src/*.ts`) | Frontend adopts the backend's package, or maps it in one adapter module |
| IDs | `tsk_`, `sub_` | `task_<16>`, `sub_<16>` (`be:…/ids.ts:22`) | Frontend (cosmetic: `taskTag`) |
| Claim codes | `[A-Z0-9]{4}`; the fixture uses `OPEN` | Alphabet has no 0, O, 1, I or L; case-insensitive (`be:…/ids.ts:8-10`) | Frontend fixtures |
| Task | `kind`, `deadline_at`, `finished_at`, `subtask_ids`, `failure_reason` enum | No `kind`. Uses `deadline`, `done_at`/`failed_at`/`paid_at`/`refunded_at`, nested `subtasks[]` and `transactions[]`, free-text `fail_reason`, `board_code`, `nft_explorer_url`, `offer_id`, and `pin:{attempts,attempts_left,locked,verified}` (`be:…/views.ts:89-117`) | Frontend |
| Subtask | Own description, place, time limit, `photo:{url,note}`, `yikyak_post`, PIN fields | **No description, place or time limit** (they come from the parent task). Uses `photo: MediaView`, `helper_note`, `post_text`, `yikyak_screenshot`, `payout_tx_hash`. PIN state lives on the task (`be:…/views.ts:62-87`) | Frontend |
| LedgerTx | `tx_type`, `engine_result`, `ledger_index` | `TxView` has none of those. Adds `currency`, `memo`, `nft_id`, `offer_id`, **`explorer_url`** and `error` (`be:…/views.ts:19-36`) | Frontend: use `explorer_url` and derive the type from `kind` |
| Tx kinds | `task_escrow`, `task_nft_offer`, `subtask_escrow`, `helper_payout_offer`, `nft_burn`, `requester_refund`, … | `task_funding`, `task_offer`, `subtask_funding`, `subtask_offer`, `helper_redeem_offer`, `agent_redeem_offer`, `task_nft_burn`/`subtask_nft_burn`, `refund_requester`, `refund_agent`, `wallet_setup`, `requester_funding` (`be:…/domain.ts:19-38`) | Frontend: rename, and fix labels and the money tree |
| Agent log | `id: string`, levels include `warning`, oldest first | `id: number`, levels `info\|decision\|error`, **newest first**, at most 200 | Frontend |

### HTTP

| Endpoint | Frontend expects | Backend does | Resolution |
|---|---|---|---|
| `GET /board/state` | Flat `{tasks,subtasks,txs,agent_log}` | Nested tasks, newest first, plus `vault_address` and `agent_address` (`be:apps/server/src/lib/views.ts:246-264`) | Frontend: flatten |
| `GET /claim/:code` | `state` enum, `server_time` | `status` + `claimed_by_you` + `pin` + `payout`. No `server_time` and no `paying` state (`be:…/views.ts:143-159`) | Frontend derives the state. **Ask:** add `server_time` |
| `POST /claim/:code/claim` | 200 ClaimView | 200 `{helper_token, claim}`. 409 `already_claimed` even for the same phone; 409 `conflict` when not ready; 410; 502 `ledger_error` | Frontend unwraps it and keeps the token. **Ask:** 200 for the phone that already holds the claim |
| `POST /claim/:code/photo` | Field `photo`; 403 not your claim | Field **`file`**; 401 for the wrong phone; 413 over 8 MB; re-encoded to JPEG, at most 1280 px; returns `{claim, media}` (`be:…/services/media.ts:79`) | Frontend: rename the field, cap at 8 MB, map 401 |
| `POST /claim/:code/pin` | Always 200 with `result` | Correct: 200 `{claim,payout}`, sent **after** the payout validates (slow). Wrong: **422 `wrong_pin`** with `details.attempts_left`. Third wrong: **423 `pin_locked`** (`be:…/routes/pin.ts:27-127`) | Frontend |
| PIN lock | Fails the task | Doesn't fail the task; the task fails at the deadline | Frontend shows "locked" until the deadline |
| `POST /tools/create_task` | Phone required | Phone optional; non-seat-holds get 422 `not_seat_hold` | Frontend: show the 422 message in the backup form |
| `board_url` | `/board` | `${PUBLIC_BASE_URL}/?task=<id>`, which is our landing page (`be:apps/server/src/lib/urls.ts:8-9`) | Frontend redirects `/?task=` to `/board`, or **ask** for `/board?task=` |
| `GET /tasks/:id.json` | `type`, time limit | `kind`, no time limit (`be:…/views.ts:162-176`) | Frontend |
| Open sub-tasks | DRAFT `GET /subtasks/open` | **No such endpoint** | **Ask.** Meanwhile, derive the list from `/board/state` |

### Auth, CORS and WebSocket

| Area | Frontend expects | Backend does | Resolution |
|---|---|---|---|
| Helper auth | One cookie `ap_helper` | A cookie per code (`ap_helper_<CODE>`), also accepted as `x-helper-token` or Bearer. The docs recommend localStorage plus a header, because web and API are on different origins (`be:docs/api.md:53-54`) | Frontend: store `helper_token` and send `x-helper-token` |
| CORS | none | `credentials:true`, origins from `CORS_ORIGINS` (default `http://localhost:3000`) | Set the env var |
| WS snapshot | `{type:"board.snapshot", snapshot}` | `{type:"snapshot", seq, state}` | Frontend (this is the crash) |
| WS seq | Starts at 1 | Starts at boot time in ms; the server sends a snapshot after a restart | Treat any snapshot as a reset |
| WS events | Full objects | Partial patches: `photo.added{task_id,subtask_id,media,helper_note}`, `pin.failed{attempts_left}`, `agent.log{entry}`, new **`tx.failed`** and **`subtask.paid`**, and `task.created` sent **twice** per task | Frontend: patch reducers, and ignore unknown types |
| Ports | API at `:8080` | Server `PORT` 3001; separate Render services | Frontend: default to `:3001` |
| Media | `url` strings | `MediaView{url,width,height}` at `${PUBLIC_API_URL}/media/<id>` | Frontend |
| Workspace | pnpm 11, Node ≥24, `sharp: false` | pnpm 10.12.1, Node ≥22, and the **server needs `sharp` built** | Agree before merging the branches |

## Frontend work, in priority order (done)

1. **Stop the crash:**
   - Ignore unknown events.
   - Handle `{type:"snapshot", state}`.
   - Flatten nested tasks.
   - Reverse `agent_log`.
2. **Adopt the backend types** (or write one adapter):
   - Tx kind names, field names and `MediaView`.
   - PIN from `task.pin`.
   - Sub-task text from the parent task.
3. **Update the event reducers:**
   - Handle `tx.failed` and `subtask.paid`.
   - Treat events as patches, not whole objects.
4. **Claim page:**
   - Derive its state from `status`, `claimed_by_you`, `pin` and `payout`.
   - Unwrap the wrapped responses.
   - Send the photo as `file`.
   - Map the PIN's 422 and 423 responses.
   - Send the helper token as a header.
5. **Env:** API at `:3001`, `CORS_ORIGINS`, and the `board_url` redirect.
6. **`/human` list:** derive it from `/board/state` until there's an endpoint.
7. **Small items:** `/tasks/:id.json`, wider error codes, the backup form's `not_seat_hold` message, and the claim-code alphabet in fixtures.

## Open questions for the backend person

1. Add `GET /subtasks/open`, or agree that the frontend derives it from `/board/state` (only sub-tasks with `offer_id` set)?
2. Add `server_time` to the claim view and `/board/state`, for countdowns?
3. Should `GET /claim/:code` return the photo and note to people who haven't claimed it?
4. Should `board_url` be `/board?task=<id>`?
5. Should the sub-task fail reason be exposed? Should a locked PIN fail the task straight away?
6. How will the ledger's `tx.unknown` reach the board?
7. Can the claim endpoint return 200 when the caller already holds that claim?
8. Which pnpm version and Node engine should the workspace use, and should `sharp` be allowed to build?
9. **Voice agent vs. server**, which will break calls:
   - The voice agent sends `x-voice-secret`; the server checks `x-agent-pledge-secret`.
   - `PUBLIC_BASE_URL` means different things on the two sides.
   - The server ignores `call_id`, so retried calls create duplicate tasks.
   - The voice agent expects 400 `invalid_input`; the server sends `bad_request`.

## Task kinds

Only seat holds exist. The server checks the description against a seat-hold pattern and rejects anything else with 422.

- **Rejected:** "Bring me a beer", "choose between two designs" and "edit my essay without AI".
- **Fixtures:** the frontend's fixtures show those errands anyway. They are demo data only.
- **To support them for real:** the server's `isSeatHold` check and the voice agent's prompt would both need to change.
