# Web: board and claim page

Next.js (App Router), TypeScript, Tailwind. Routes: `/` (board) and `/c/[code]` (claim page).
Types come from `@agent-pledge/shared` (draft contract, see `packages/shared/CONTRACT.md`).

```sh
pnpm dev:web:fixtures   # from the repo root: fixture data, no server needed
pnpm dev:web            # against a server; see .env.example
```

## Layout

| Path | What |
|---|---|
| `components/board/*` | Board UI (#32 to #38). `Board.tsx` wires `useBoard` to the cards. |
| `components/claim/*` | Claim page UI (#39 to #42). `ClaimScreen.tsx` loads the claim and picks a view per state. |
| `components/ui/*` | Shared pieces: status badges, money, explorer links, countdown. |
| `lib/api/*` | `getApiClient()`: HTTP client, or the fixture client in fixture mode. |
| `lib/board/*` | Board state reducer, selectors, sync (reconnect and seq resync), transports, `useBoard`. |
| `lib/fixtures/*` | Fixture data built from the PRD's seat-hold flow. |
| `lib/format.ts`, `lib/labels.ts` | RLUSD amounts, explorer links, countdowns, enum labels. |

## Fixture mode (`NEXT_PUBLIC_FIXTURES=1`)

The board starts from a history with a task and a sub-task in every status, then streams a new
live run every few seconds (success and failure alternate). The header has buttons that drop the
connection and skip an event, to exercise reconnect and resync.

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
| anything else | not found |

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

The task card appears and the number in the header stays under 2 s. In fixture mode, use the backup form
(below) instead of `curl`: it also says how long the new task took to reach the board.
`lib/board/fixture-transport.test.ts` checks that a board catches up within the budget after a dropped connection.
