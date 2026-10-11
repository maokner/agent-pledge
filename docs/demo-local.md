# Local demo runbook (everything on this laptop)

The server, the local agent, and a cloudflared quick tunnel all run on this laptop.
One command starts them, repoints the phone agent, and prints the URLs.
What to say and what must happen in each run is in [`docs/runbook.md`](runbook.md) sections 3 and 4.
This page is how to operate it.

Phone number: **+1 866-808-1262**.

## Pre-demo checklist (T-30 min)

- [ ] You are in `~/Desktop/agent-pledge` on the demo branch, and `pnpm install` is done.
- [ ] Nothing started by hand is still running.
      Stop old terminals with Ctrl+C, or `kill` the pids.
      The script refuses to start if port 3002 is in use or a local agent from this checkout is running, and it prints the pid to kill.
- [ ] `packages/ledger/.env.testnet` exists if you want the real ledger (xrpl mode).
      Without it the script runs the fake ledger.
- [ ] `apps/voice-agent/.env` has `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `ELEVENLABS_PHONE_NUMBER_ID`.
- [ ] xrpl mode: the agent and the requester (treasury) each have at least 5 RLUSD per run.
      Agent: https://testnet.xrpl.org/accounts/rHg58RwCnQVLoqYyETd4pnA6HsQn5a3RqH
      Vault: https://testnet.xrpl.org/accounts/rB7wQL1Ft8RHBNdJFmw6tPGrUV8qLRE5Se
- [ ] Laptop on power, Wi-Fi stable, notifications off (Focus mode), and sleep blocked: `caffeinate -dims &`.
- [ ] Optional clean board: `pnpm demo:local --stop && pnpm demo:reset` (wipes the local database), then start.

## Start (T-15 min)

```sh
cd ~/Desktop/agent-pledge
pnpm demo:local
```

It takes about 30 seconds.
You see `ok` lines and then a block that starts with **Demo is up**.
If it prints **ERROR**, read the lines under it: they say what to do.
It stops anything it started, so you can always run it again.

Then, in this order:

1. Open the **Board** URL from the final block on the projector, full screen.
2. Open the same URL on a phone with Wi-Fi off. It loads and updates.
3. Call +1 866-808-1262. You hear the greeting. Hang up before you say "yes".
4. Open a second terminal for the logs: `tail -f .data/demo/logs/*.log`.
5. Open a third terminal for the failure trigger (do not project it):

   ```sh
   cd ~/Desktop/agent-pledge
   export API=http://localhost:3002
   export AGENT_TOKEN="$(sed -n 's/^AGENT_TOKEN=//p' apps/server/.env)"
   export VOICE_SHARED_SECRET="$(sed -n 's/^VOICE_SHARED_SECRET=//p' apps/server/.env)"
   curl -s $API/health
   ```

Hands off the laptop keyboard from here on, except for the terminals.

Every full `pnpm demo:local` gives a **new tunnel URL**.
After one, reload the board on the projector and the phone with the new URL.
To restart one part and keep the URL, use `--restart server` or `--restart agent` (see Recovery).

## Run 1: success (about 4 minutes)

| Time | Who does what | Watch on the board |
|---|---|---|
| 0:00 | Judge calls and asks for a seat at the front table in 3 minutes for $5. | Nothing yet. |
| 0:30 | Judge says "yes". The phone agent reads the PIN twice. Write it down. | A new task card. Ledger rows go "pending", then "validated". |
| 0:40 | Nobody. | Card: "claimed". Agent log: sub-task price $4.00 (80% of $5.00). Money tree: $5 in, $4 helper, $1 agent. |
| 0:50 | Nobody. | The Yik Yak post (or the preview card) with the claim link. |
| 1:00 | Helper opens the claim link on their phone and taps **Claim**. | Sub-task: "claimed". |
| 1:30 | Helper adds a photo and a note. | Photo and note on the card. |
| 2:00 | Judge walks over and says the PIN. Helper types a wrong PIN, then the right one. | Wrong PIN: "2 attempts left". Right PIN: "Paid $4.00" with an explorer link. |
| 2:30 | Nobody. | Agent redeems: $6.00 to the agent. Money tree green. Task: "done". |

If the call fails, use the fallback in [Phone not answering](#phone-not-answering).

## Run 2: failure (about 3 minutes)

| Time | Who does what | Watch on the board |
|---|---|---|
| 0:00 | Judge calls and asks for a seat by the window in 2 minutes for $6, and says "yes". | New task card, then "claimed" and a sub-task, as in run 1. |
| 0:30 | Nobody claims (ask the room not to). | The sub-task stays "open". |
| 2:00 | Nobody. The deadline passes. | Within a few seconds: task "failed" with the reason, NFTs burned, refund rows with explorer links. The requester gets $7.00 ($6 + the $1 pledge). |

If the deadline does not fire, or you are short on time, fail it by hand in the third terminal (`POST /admin/tasks/:id/fail` from [`docs/api.md`](api.md)):

```sh
TASK=$(curl -s $API/board/state | jq -r '.tasks[0].id')
curl -s -X POST $API/admin/tasks/$TASK/fail \
  -H "Authorization: Bearer $AGENT_TOKEN" -H 'content-type: application/json' \
  -d '{"reason":"No helper in time"}' | jq '.task.status'
```

It prints `"failed"`.
`.tasks[0]` is the newest task.
The call is safe to repeat.

Yik Yak: leave at least 10 minutes between two real posts.

## Recovery

First look at the logs: `.data/demo/logs/server.log`, `agent.log`, `tunnel.log` (and `provision.log`).

### Tunnel died

Signs: the board on the phone or the projector stops loading, or the phone agent says it cannot reach the service, while `curl -s http://localhost:3002/health` still works.

1. Run `pnpm demo:local` again. It makes a new tunnel, rewrites the URLs, restarts the server and the agent, and repoints the phone agent.
2. Reload the board on the projector and the phone with the new URL from the final block.
3. Claim links from earlier Yik Yak posts use the old URL and no longer work. Start a new task.

### Server died

Signs: `curl -s http://localhost:3002/health` fails, and `server.log` ends with an error.

1. Run `pnpm demo:local --restart server`. The tunnel URL stays the same, and the local agent reconnects by itself.
2. Reload the board.
3. Fake mode keeps the ledger in memory, so a task that was in progress cannot finish. Start a new task.
4. If it fails again at once, run `pnpm demo:local --mode fake` (new URL) and say that we are on the simulated ledger.

### Agent stuck

Signs: a new task stays "open" for more than 30 seconds, or `agent.log` shows no new lines.

1. Run `pnpm demo:local --restart agent`.
2. The server sends the task to the agent again until the agent acknowledges it, so nothing is lost.
3. Watch `agent.log` for `[ws] open` and then `New task`.

### Phone not answering

Signs: the call does not connect, the agent says something went wrong, or no task card appears after "yes".

1. Check the server through the tunnel: `curl -s <Health URL from the final block>`. If it fails, see [Tunnel died](#tunnel-died).
2. Repoint the phone agent again: `cd apps/voice-agent && pnpm provision`. It checks the server first and changes nothing if the check fails.
3. Fallback that always works: make the task by hand in the third terminal and read the PIN aloud:

   ```sh
   curl -s -X POST $API/tools/create_task -H "x-agent-pledge-secret: $VOICE_SHARED_SECRET" \
     -H 'content-type: application/json' \
     -d '{"description":"Save a seat at the front table","place":"Main Stacks","time_limit_minutes":3,"price_usd":5}' | jq
   ```

## Command reference

| Command | What it does |
|---|---|
| `pnpm demo:local` | Start everything. xrpl mode if `packages/ledger/.env.testnet` exists, else fake. |
| `pnpm demo:local --mode fake` | Start with the simulated ledger. |
| `pnpm demo:local --no-provision` | Start, but do not repoint the phone agent. |
| `pnpm demo:local --no-tunnel` | Local only, no public URL, no phone. |
| `pnpm demo:local --port 3202` | Use another port (for tests next to the real demo). |
| `pnpm demo:local --restart server` | Restart only the server. Same URL. |
| `pnpm demo:local --restart agent` | Restart only the local agent. Same URL. |
| `pnpm demo:local --stop` | Stop the tunnel, the server, and the agent. |

The script rewrites only the URL, port, and ledger lines in `apps/server/.env`, `apps/local-agent/.env`, and `apps/voice-agent/.env`.
It creates missing files from the `.env.example` files with new secrets, and it makes `AGENT_TOKEN` and the voice secret match across the three files.
It never prints seeds or secrets.
Pid files and logs are in `.data/demo/`.
