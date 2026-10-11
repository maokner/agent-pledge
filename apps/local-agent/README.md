# Local agent (`apps/local-agent`)

The program on our laptop that does the work with nobody at the keyboard (PRD 7, issues #27 and #29).
For each task it gets over `/ws/agent` it: acks, claims the task (pays the pledge), sets the sub-task price,
creates the sub-task (pays its money into the vault), writes a Yik Yak post with the claim link, posts it,
uploads the screenshot to the board, and later redeems the task NFT when the server sends `task.redeemable`.
Every decision goes to the board as an `agent.log` entry (for example `Sub-task price: 4.00 (80% of 5.00)`).

## Run

```bash
cp apps/local-agent/.env.example apps/local-agent/.env   # set AGENT_TOKEN to the server's AGENT_TOKEN
pnpm --filter @agent-pledge/local-agent start
```

Then create a task (the server must be running, see the root README):

```bash
curl -X POST localhost:3001/tools/create_task -H "x-agent-pledge-secret: $VOICE_SHARED_SECRET" \
  -H 'content-type: application/json' \
  -d '{"description":"Save me a seat at the front table","place":"Main Stacks","time_limit_minutes":3,"price_usd":5}'
```

The agent console shows each step and the time it took. The board shows the same steps as `agent.log` entries.

## Modes

| Setting | Values | Notes |
|---|---|---|
| `AGENT_MODE` | `llm`, `scripted` | `llm` uses the Claude Agent SDK with the five PRD 7.2 tools. `scripted` runs the same steps without a model. Default: `llm` when `ANTHROPIC_API_KEY` is set, else `scripted`. In `llm` mode, if the model fails or skips a step, the agent finishes the task with the scripted steps and logs it. |
| `AGENT_MODEL` | default `claude-haiku-5-5` | A fast model so the claim and sub-task happen within seconds. |
| `LEDGER_MODE` | `fake`, `xrpl` | `fake`: the agent calls the server without tx hashes and the server performs the agent's ledger step. `xrpl`: signs on this laptop with `AGENT_SEED` through `createAgentLedger` from `@agent-pledge/ledger` (needs `VAULT_ADDRESS`). The seed never leaves the laptop. Must match the server's `LEDGER_MODE`. |
| `YIKYAK_DRIVER` | `render`, `playwright`, `computer-use` | See below. Default `render` (safe). |

The sub-task price policy (80% of the task price, rounded down to the nearest 0.50) is in the system prompt in
`src/llm.ts`. The `create_subtask` tool only enforces that the price is a valid amount, more than 0, and not more
than the task price. The model writes the post from the task data and the claim URL; `post_yikyak` rejects a post
that does not contain the claim URL.

## Yik Yak drivers (#29)

- `render`: renders the post as a Yik Yak-style card in headless Chromium and screenshots it. **Not a real post**;
  the board log says so. Not rate limited.
- `playwright`: opens a **visible** Chromium window (the laptop is projected) with the persistent profile in
  `YIKYAK_PROFILE_DIR`, so our Yik Yak login is reused. It goes to `YIKYAK_URL`, clicks
  `YIKYAK_COMPOSE_SELECTOR` (optional), fills `YIKYAK_TEXT_SELECTOR`, clicks `YIKYAK_SUBMIT_SELECTOR`, waits
  `YIKYAK_POST_WAIT_MS`, and screenshots the page. The URL and selectors are guesses until #28 confirms the site.
  To log in once: start the agent with this driver, let the window open, and log in by hand; the profile keeps it.
  Set `YIKYAK_BROWSER_CHANNEL=chrome` to use the installed Google Chrome.
- `computer-use`: stub that throws "not implemented, see #28".

Both browser drivers need Playwright's Chromium once:

```bash
pnpm --filter @agent-pledge/local-agent exec playwright install chromium
```

**Rate limit:** at most one real post per `YIKYAK_MIN_INTERVAL_SECONDS` (default 600). A second post within that
window is queued, logged on the board, and posted (and uploaded) when the slot opens. The queue and the time of the
last post are saved in the state file, so a restart still respects the limit. A queued post whose sub-task deadline
has passed is dropped and logged. If a post fails, the error is logged on the board and the screenshot file is kept.

## State files

Everything lives in `AGENT_STATE_DIR` (default `apps/local-agent/.data/`, git-ignored):

| Path | What | Reset? |
|---|---|---|
| `yikyak-state.json` | Last real post time and the post queue (rate limit) | Delete to reset the rate limit and queue |
| `screenshots/` | Screenshots of each post | Safe to delete |
| `chrome-profile/` | Browser profile with our Yik Yak login (unless `YIKYAK_PROFILE_DIR` is set) | **Keep** — deleting it logs us out |

A reset script should delete `yikyak-state.json` and `screenshots/` and keep `chrome-profile/`.
Task progress is kept in memory only; the server resends unacked `task.new` and unpaid `task.redeemable` on reconnect.

## Test

```bash
pnpm --filter @agent-pledge/local-agent test
```

The tests use a mock server (`test/mock-server.ts`) and a fake Yik Yak driver. They never call the model and never
post to Yik Yak.
