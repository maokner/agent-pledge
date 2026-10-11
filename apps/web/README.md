# Web: board and claim page

Next.js (App Router), TypeScript, Tailwind. Routes: `/` (landing), `/board` (board), `/human` (open sub-tasks) and `/c/[code]` (claim page).
Pages live in route groups that set each surface's design tokens: `app/(landing)`, `app/(human)` and
`app/(agent)`. See `docs/design/DIRECTION.md`.
Types come from `@agent-pledge/shared` (draft contract, see `packages/shared/CONTRACT.md`).

```sh
pnpm dev:web:fixtures   # from the repo root: fixture data, no server needed
pnpm dev:web            # against a server; see .env.example
```

## Layout

| Path | What |
|---|---|
| `components/board/*` | Board UI (#32 to #38, #43). `Board.tsx` wires `useBoard` to the cards, or to `ProjectorBoard` in projector mode. |
| `components/claim/*` | Claim page UI (#39 to #42). `ClaimScreen.tsx` loads the claim and picks a view per state. |
| `components/landing/*` | Landing page (`/`): the two role buttons and the "powered by" footer. |
| `components/ui/*` | Shared pieces: status badges, money, explorer links, countdown. |
| `lib/api/*` | `getApiClient()`: HTTP client, or the fixture client in fixture mode. |
| `lib/board/*` | Board state reducer, selectors, sync (reconnect and seq resync), transports, `useBoard`. |
| `lib/backup-task/*`, `app/api/backup-task/route.ts` | The backup form's validation, browser client and server-side proxy to create_task (#38). |
| `lib/fixtures/*` | Fixture data built from the PRD's seat-hold flow. |
| `lib/format.ts`, `lib/labels.ts` | RLUSD amounts, explorer links, countdowns, enum labels. |

## Fixture mode (`NEXT_PUBLIC_FIXTURES=1`)

The board starts from a history with a task and a sub-task in every status, then streams a new
live run every few seconds (success and failure alternate). The header has buttons that drop the
connection and skip an event, to exercise reconnect and resync.

`/preview?layout=one|three|stops` (fixture mode only) shows static boards with one task and one sub-task,
three tasks, or one task at each point in the flow, to check the card layout without waiting for the stream. Add `&projector=1` to see
them in projector mode.

Claim codes for `/c/<code>` (the PIN is `4821`; state lives in memory, so reload to reset):

| Code | Starts as |
|---|---|
| `OPEN` | open (click Claim, add a photo, enter the PIN) |
| `MINE` | claimed by you, no photo |
| `PHOT` | claimed by you, photo added, one wrong PIN |
| `TAKN` | already claimed |
| `EXPD` | expired |
| `LOCK` | locked |
| `PAYG` | paying, then paid after about 4 seconds |
| `PAID` | paid |
| `RACE` | open, but tapping Claim loses to another phone ("Already claimed") |
| `FLAK` | open, on a bad signal: the first claim response is lost (the claim went through) and the first photo upload fails part way |
| `SOON` | open with 20 seconds left, then expired |
| anything else | not found |

Claiming takes about 5 seconds in fixture mode, like the real ledger.

Open sub-tasks (`getApiClient().listOpenSubtasks()`, the DRAFT `GET /subtasks/open` for the `/human` list) are
the codes that start open: `OPEN`, `RACE`, `FLAK` and `SOON`, each with its own pay, place and deadline, so
every item opens a working claim page. One drops out once this tab claims it (or loses the `RACE`), and `SOON`
drops out 20 seconds after it is first loaded. Add `?fixtures=empty` to the page URL (for example
`/human?fixtures=empty`) to get an empty list and see the empty state. Show the list with
`openSubtasksToShow(subtasks, now)` from `lib/api`: soonest deadline first, expired items removed.

## Projector mode (#43, PRD 9.1)

The board laid out for a projector, readable from the back of the room. Open `/board?projector=1`, or click
"Projector mode" in the board's header (shown on screens 1024 px and wider). The choice is remembered in
`localStorage` (`agent-pledge:projector`), so the projector laptop stays in projector mode across reloads.
Leave it with "Normal view" or `?projector=0`. Logic: `lib/board/projector.ts`, `lib/board/use-projector-mode.ts`.

What changes:

- **One screen, no scrolling.** The newest task fills a big card: the task's status, time left and price
  across the top; the money tree; the sub-task with its pay, status, **PIN tries left** and time left; the
  newest transactions (with a "Show all" toggle); the Yik Yak screenshot and the seat photo, shrunk to fit.
  The agent log runs down the right side. Up to two other tasks show as small cards under the big one
  (tasks still running first), with "+N more" after that. Click a small card to put it in the big card;
  "Follow newest" goes back.
- **Sized to the screen.** On screens 1024 px and wider, `1rem` is `min(1.0417vw, 1.852vh)`: 20 px at
  1920x1080, 13.3 px at 1280x720. The same layout fills both, and text is the same size on the wall.
- **Big type.** At 1080p the amounts and time left are 60 px, PIN tries left 45 px and the status badges
  37.5 px bold capitals (3.5 to 5.5 % of the screen height). Nothing a judge reads is under 20 px (1.9 %):
  the agent log and the transactions are 22.5 px. On a 3 m wide screen a 1080p pixel is about 1.6 mm, so
  the status capitals are about 4 cm tall: about 14 arc minutes at 10 m, where 5 is the limit of
  normal sight. NFT IDs are left out of the money tree, since nobody can read hex on a wall.
- **Colors.** The board is dark terminal style in every mode, big-screen mode included: the demo screen
  shows black fine. Big-screen mode keeps the scanlines fainter and the phosphor glow subtle so large text
  stays sharp. See `docs/design/agent-design-system.md`. Each status is also a text tag, never only a color.

Checked in a browser at 1920x1080 and 1280x720 with `/preview?layout=one|three|stops&projector=1` and the
live fixture stream. **Still to do at rehearsal (#30):** on the real projector, open `/board?projector=1` in
full screen (Chrome: View, Enter Full Screen) at the projector's native resolution, and walk to the back
of the room: read the status, the amounts and the PIN tries left, and check that amber (pending) and
sky (held in the vault) are still told apart on that projector.

## Live updates (#35, PRD R3)

`useBoard` loads `GET /board/state`, then opens `/ws/board?since=<snapshot seq>` and applies each event.
If the snapshot load fails it connects from seq 0 and the server sends a `board.snapshot` instead.
On a drop it reconnects with backoff (250 ms, doubling, capped at 4 s) from the last seq it applied, and
reconnects at once when the tab becomes visible again or the browser comes back online (a phone that slept).
On a seq gap it reconnects at once. All of this is in `lib/board/sync.ts`.

The header shows the connection: green "Live", amber while connecting, red "Offline, reconnecting" when
the socket is down. Next to it, a small number is the last event's time from the server to the screen
(the event's `at` to the paint after React committed it). Hover it for the split: server to browser
(which includes any clock difference between the server and the phone) and browser to screen, the worst
of the last 20 events, and how many went over 2 s. It turns amber over 2 s. The element also carries
`data-last-total-ms`, `data-worst-total-ms` and `data-over-budget` for scripted checks.

**R3 check against a real server:** open the board on a phone, then create a task:

```sh
curl -sS -X POST "$API_URL/tools/create_task" \
  -H "content-type: application/json" -H "x-agent-pledge-secret: $VOICE_SECRET" \
  -d '{"description":"Save me a seat at the front table","place":"Main Stacks, front table","time_limit_minutes":3,"price_usd":5,"caller_phone":"+15105550123"}'
```

The task card appears and the number in the header stays under 2 s. In fixture mode, create a task with the
backup form (below) instead of `curl`. To check from the browser console:
`document.querySelector('[data-testid=latency-meter]').dataset`.
`lib/board/fixture-transport.test.ts` checks that a board catches up within the budget after a dropped connection.

## Agent log (#37)

The right-hand panel shows `agent.log` lines in the order the server sent them, newest at the bottom, each
with its time and a short tag for its task (the last 4 characters of the task ID; hover for the task's
description). It follows new lines while scrolled to the bottom. Scrolling up pauses that and shows a
"N new lines, jump to latest" button. The board keeps the last 200 lines (`AGENT_LOG_LIMIT`).
The local agent adds lines with `POST /agent/log`.

## Backup form (#38, PRD 11)

If the phone call fails, the small "Phone call failed? Create the task here" link at the bottom of the board
opens a form with the voice agent's `create_task` fields (description, place, time limit, price, and an
optional phone). It shows the PIN that comes back, and says when the task is on the board.

The browser cannot hold the voice agent's shared secret, so the form posts to this app's route handler
`POST /api/backup-task` (`app/api/backup-task/route.ts`, logic in `lib/backup-task/`). The route checks an
operator passcode (header `x-backup-passcode`), validates the form, and calls the server's
`POST /tools/create_task` with `x-agent-pledge-secret`. Its server-only env vars (see `.env.example`):

| Variable | What |
|---|---|
| `BACKUP_FORM_PASSCODE` | What the operator types into the form. The route returns 503 until it is set. |
| `AGENT_PLEDGE_SERVER_URL` | The server's base URL from the web server. Defaults to `NEXT_PUBLIC_API_URL` if absolute. |
| `AGENT_PLEDGE_VOICE_SECRET` | The voice agent's shared secret. |
| `BACKUP_FORM_CALLER_PHONE` | `caller_phone` when the form leaves it empty. Default `+15555550100`. |

This needs the web app to run as a Next.js server (not a static export), and on a shared host `/api/*` must
route to Next.js. The form remembers the passcode for the browser tab (sessionStorage).

In fixture mode the route answers from the fixture client (PIN `4821`) and needs no passcode unless
`BACKUP_FORM_PASSCODE` is set. The page then adds the task to the simulated stream, which runs it
through the seat-hold flow.
