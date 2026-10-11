# Demo runbook (issue #30)

Goal (PRD section 10, item 8): two full demos in a row, one success and one failure, with nobody touching the laptop.
Tick the requirements in [`docs/demo-checklist.md`](demo-checklist.md) during each rehearsal.
Deployment and URLs: [`docs/deploy.md`](deploy.md). API: [`docs/api.md`](api.md).

Set these on the operator's machine (a teammate's laptop, **not** the demo laptop):

```sh
export API=https://agent-pledge-api.onrender.com
export AGENT_TOKEN=...            # from the password manager
export VOICE_SHARED_SECRET=...    # from the password manager
export BOARD=https://agent-pledge-web.onrender.com
```

## Roles

| Who | Where | Job |
|---|---|---|
| Back end (runbook owner) | Operator laptop | Reset, health checks, fallbacks, failure trigger. Calls the steps. |
| Voice | Their phone | Owns the phone number. Makes the backup call. |
| Front end | Board | Projector, board, claim page, web form fallback. |
| "Judge" | Phone on speaker | Calls the number, walks to the seat, says the PIN. |
| "Helper" | A phone that has never used Agent Pledge, on cellular data | Sees the Yik Yak post, claims, adds a photo, types the PIN. |

## 1. Reset (T-30 min)

Reset only before a session, never between the two runs: the judges should see both tasks on the board.

1. Stop the local agent on the demo laptop (Ctrl+C).
2. Wipe the production database, check balances, and clear the local agent's state. On the **demo laptop** (so its local agent state is cleared), with Render's **external** database URL (Render Dashboard > `agent-pledge-db` > **Connect** > **External**):

   ```sh
   DATABASE_URL='postgresql://...render.com/agent_pledge?sslmode=require' pnpm demo:reset
   ```

   It runs `pnpm db:reset` (drop everything, re-run migrations), prints the vault, agent, and treasury balances, and clears `apps/local-agent/.data` (or `AGENT_STATE_DIR`), keeping `chrome-profile/` so the Yik Yak login survives.
   In xrpl mode, also set `LEDGER_MODE=xrpl VAULT_SEED=... TREASURY_SEED=... AGENT_ADDRESS=... TREASURY_ADDRESS=...` so the balances are real. Fix every `WARNINGS` line before going on (refill from the treasury or the testnet faucet).
   Without `DATABASE_URL` it resets the local PGlite database instead (stop `pnpm dev` first).
3. Restart the server: Render > `agent-pledge-api` > **Manual Deploy** > **Restart service**. This clears the in-memory event buffer (and, in fake mode, the in-memory ledger).
4. Health: `curl -fsS $API/health` returns `{"ok":true,"ledger_mode":"xrpl",...}` (or `fake` if we fell back).
5. Board: `curl -s $API/board/state | jq '.tasks | length'` returns `0`.

## 2. Start order (T-20 min)

1. **Server**: already up (step 1.4).
2. **Local agent** on the demo laptop: start it as `apps/local-agent` documents (for example `pnpm --filter @agent-pledge/local-agent start`). It connects out to `wss://<API host>/ws/agent`. Check its console says it is connected, and the server log on Render shows the `/ws/agent` connection.
3. **Yik Yak** on the demo laptop: open it in the browser profile that is logged in (PRD section 8). Check that:
   - it is still logged in and shows the local feed (laptop near the venue);
   - the last post from our account was **more than 10 minutes ago** (one post per 10 minutes, or Yik Yak may block us).
4. **Board on the projector**: open `$BOARD` in projector mode (the board's large-text mode; if it has none, full screen with Ctrl+Cmd+F and zoom until the back row can read it).
   Put the demo laptop's browser on the projector too (split screen or a second input), so the judges see the post being typed.
5. **Board on a phone over cellular**: open `$BOARD` with Wi-Fi off. It loads and updates.
6. **Phone number answers**: the voice person calls the number from a team phone, hears the greeting, and **hangs up before saying "yes"** (saying yes creates a real task).
7. **Helper phone**: cellular data, a private browser tab (fresh cookies), Yik Yak app open on the local feed.
8. Hands off the demo laptop from here on.

## 3. Run 1: success

| Step | Who does what | What must happen (target time) |
|---|---|---|
| 1 | Judge calls and says: "Save me a seat at the front table in the next 3 minutes. I will pay $5." | The voice agent repeats task, place, time, price. |
| 2 | Judge says "yes". | Task card appears on the board (< 2 s after the call's tool request). The voice agent reads the PIN twice. Write the PIN down. |
| 3 | Nobody | Ledger rows: requester funding, task funding, task NFT mint, offer (pending, then validated, each with an explorer link). |
| 4 | Nobody | Local agent claims (card: "claimed"), logs the sub-task price ("$4.00, 80% of $5.00"), creates the sub-task ($4.00). Money tree shows $5 in, $4 helper, $1 agent. |
| 5 | Nobody | The laptop browser types and posts the Yik Yak post with the claim link. The screenshot appears on the board. |
| 6 | Helper opens the post's link on their phone, taps **Claim**. | Sub-task card: "claimed". |
| 7 | Helper adds a photo and the note "Front table, left side". | Photo and note on the board. |
| 8 | Judge walks over and says the PIN. Helper types a wrong PIN first, then the right one. | Wrong PIN: "2 attempts left", no payment. Right PIN: "Paid $4.00" with an explorer link. |
| 9 | Nobody | Local agent redeems the task NFT: agent paid $6.00 ($5 + $1 pledge). Money tree turns green. Task: "done". |

If the phone call fails, use the web form fallback (section 5) and go on.

## 4. Run 2: failure

Use different values so R9 is visible: "Save me a seat by the window in the next **2 minutes**. I will pay **$6**." (Long enough for the agent to create the sub-task, so the agent refund shows too.)
Then nobody claims (ask the room not to), or the helper claims and never gets the PIN.

- **Natural timeout (preferred)**: after the deadline, the server's deadline checker fails the task within a few seconds.
- **Trigger it by hand** (backup, from the operator laptop, not the demo laptop), with the task ID from the board or from:

  ```sh
  TASK=$(curl -s $API/board/state | jq -r '.tasks[0].id')
  curl -s -X POST $API/admin/tasks/$TASK/fail \
    -H "Authorization: Bearer $AGENT_TOKEN" -H 'content-type: application/json' \
    -d '{"reason":"No helper in time"}' | jq '.task.status'
  ```

What must happen: task "failed" with the reason; NFTs burned; the vault refunds the requester $7.00 ($6 price + the agent's $1 pledge) and the agent $4.50 (the sub-task money). Each refund has an explorer link. Show that the pledge went to the requester.

Yik Yak: run 2 also posts. Leave **at least 10 minutes** between the two posts, or have the local agent skip posting in run 2 (decide in rehearsal).

## 5. Fallbacks (PRD section 11)

| Problem | What we do |
|---|---|
| **The phone call fails** (no answer, the agent mishears, tool error) | Front end opens the board's web form, enters the same four values, and submits. It sends the same `create_task` call; the board shows the PIN to read out. Test this in every rehearsal. Last resort from the operator laptop: `curl -s -X POST $API/tools/create_task -H "x-agent-pledge-secret: $VOICE_SHARED_SECRET" -H 'content-type: application/json' -d '{"description":"Save a seat at the front table","place":"Main Stacks","time_limit_minutes":3,"price_usd":5}' \| jq` and read the `pin` aloud. |
| **XRPL testnet is slow** (about 4 s per ledger, sometimes much more) | Keep going: the board shows "pending" rows and fills in explorer links when they validate. Narrate it ("the ledger is confirming"). Allow a longer time limit (5 minutes) so the deadline does not fire while transactions are pending. |
| **XRPL testnet is down** | Render > `agent-pledge-api` > **Environment**: `LEDGER_MODE=fake`, save (redeploy about 3 minutes). Say that we are on the simulated ledger. Explorer links will not resolve. Switch back afterwards. |
| **Yik Yak blocks the account or will not post** | Play the backup recording of a real post. The board shows the claim link; the helper opens it from the board on their phone (or a QR code of it). If the desktop site does not work at all, use the Yik Yak iPhone app on an Apple silicon Mac with computer use (PRD section 8). |
| **Nobody claims the sub-task** | A teammate on a fresh phone claims it. If there is no time, it becomes the failure run: the pledge goes to the requester. |
| **Three wrong PINs lock the sub-task** | It fails at the deadline; treat it as the failure run. |
| **The local agent crashes** | Restart it. The server resends `task.new` until the agent acks it, and `task.redeemable` until it redeems, so nothing is lost. |
| **The server is down** | Render > `agent-pledge-api` > **Logs**, then **Manual Deploy** > **Restart service**. `curl $API/health`. |
| **The board stops updating** | Reload the page (it resyncs from a snapshot). |

## 6. Rehearsal procedure

1. Reset (section 1) and start everything (section 2).
2. Run 1, then run 2, back to back, with a stopwatch. Nobody touches the demo laptop.
3. Tick every line in `docs/demo-checklist.md` for this rehearsal. Note the time of each step.
4. Test one fallback per rehearsal: the web form first, then the admin fail, then Yik Yak blocked (recording).
5. Before a quick back-end check without the phone or the laptop, run `SMOKE_API_URL=$API pnpm smoke` (fake ledger only; then reset again).
6. Done when two back-to-back rehearsals pass with every R1 to R9 test ticked.
