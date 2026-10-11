# Deploy to Render (issue #26)

One Render Blueprint (`render.yaml` at the repo root) creates:

| Resource | Name | What |
|---|---|---|
| Web service (Docker) | `agent-pledge-api` | The Fastify server from `apps/server/Dockerfile`. HTTPS and WebSockets (`/ws/board`, `/ws/agent`) on one URL. Health check `/health`. Migrations run at startup. |
| Postgres | `agent-pledge-db` | Managed Postgres 17. Holds everything, including photos and screenshots (`bytea`), so no disk or bucket is needed. |
| Web service (Node) | `agent-pledge-web` | The board and claim page (`apps/web`). **Commented out** until `apps/web` exists. |

Expected time: about 10 minutes, most of it waiting for the first build.

## Plans and cost

The Blueprint uses paid plans on purpose: web `starter` (about $7 a month) and Postgres `basic-256mb` (about $6 a month), both billed by the second.
Free web instances sleep after 15 minutes without traffic and take about a minute to wake up. That drops the board and agent WebSockets and times out the ElevenLabs tool call in the middle of a demo.
Free Postgres expires after 30 days.
Delete both resources after the hackathon.

## 1. Before you start

- A Render account with a card on file (paid plans), logged in with GitHub, and access to this GitHub repo.
- `render.yaml` must be on `main` (the services deploy `branch: main`). To deploy before the merge, change `branch:` in `render.yaml` on the branch you deploy from.
- Generate the four secrets on your laptop and keep the output in the team's password manager:

  ```sh
  pnpm deploy:secrets
  # VOICE_SHARED_SECRET=...
  # AGENT_TOKEN=...
  # COOKIE_SECRET=...
  # SEED_ENCRYPTION_KEY=...
  ```

  Each is `openssl rand -hex 32` (64 hex characters). `openssl rand -hex 32` four times works too.

## 2. Create the Blueprint

1. Render Dashboard > **New** > **Blueprint**.
2. Connect this GitHub repo. Render finds `render.yaml`. Blueprint name: `agent-pledge`.
3. Render asks for every `sync: false` value. Fill them in like this (no trailing slashes):

   | Key | Value |
   |---|---|
   | `PUBLIC_API_URL` | `https://agent-pledge-api.onrender.com` |
   | `PUBLIC_BASE_URL` | `https://agent-pledge-web.onrender.com` (the board; claim links are `<this>/c/<CODE>`) |
   | `CORS_ORIGINS` | `https://agent-pledge-web.onrender.com,http://localhost:3000` |
   | `VOICE_SHARED_SECRET` | from `pnpm deploy:secrets` |
   | `AGENT_TOKEN` | from `pnpm deploy:secrets` |
   | `COOKIE_SECRET` | from `pnpm deploy:secrets` |
   | `SEED_ENCRYPTION_KEY` | from `pnpm deploy:secrets` |
   | `VAULT_SEED`, `TREASURY_SEED`, `AGENT_ADDRESS` | leave empty while `LEDGER_MODE=fake` (see section 6) |

4. Click **Apply**. Render creates the database first, then builds the Docker image (3 to 5 minutes).
5. Open `agent-pledge-api` and read its URL at the top of the page. If Render added a suffix (for example `agent-pledge-api-x1y2.onrender.com`) because the name was taken, open **Environment**, set `PUBLIC_API_URL` to the real URL, and **Save, rebuild, and deploy**.

The server refuses to start in production while any of the four secrets is missing or still the dev default. The log then says `Set these secrets in production: ...`. Set them under **Environment** and save.

`sync: false` values are asked for only when the Blueprint is first created. To change one later, edit it under the service's **Environment** tab.

## 3. Smoke checks

Replace `API` with your URL.

```sh
API=https://agent-pledge-api.onrender.com

# 1. Health: expect {"ok":true,"ledger_mode":"fake","time":"..."}
curl -fsS $API/health

# 2. Board WebSocket: expect one {"type":"snapshot",...} message
node -e "const ws=new WebSocket(process.argv[1]);ws.onmessage=e=>{console.log(String(e.data).slice(0,200));process.exit(0)};ws.onerror=()=>{console.error('ws error');process.exit(1)}" "${API/https/wss}/ws/board"

# 3. Voice secret: expect 401 with a wrong secret
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/tools/create_task -H 'x-agent-pledge-secret: wrong' -H 'content-type: application/json' -d '{}'

# 4. The full success and failure flows (fake ledger only). This creates two demo tasks;
#    run the production reset (docs/runbook.md) afterwards.
SMOKE_API_URL=$API VOICE_SHARED_SECRET=... AGENT_TOKEN=... pnpm smoke
```

`pnpm smoke` plays the voice agent, the local agent, two helper phones, and the admin. Stop the real local agent first, or it will race the script for the task.

Then, on a phone **on cellular data (Wi-Fi off)**, open `$API/health` and, once it is deployed, the board URL. Both must load.

## 4. Hand-offs

### Voice teammate (ElevenLabs)

Send in a direct message, never in git or a public channel:

- Base URL: `https://agent-pledge-api.onrender.com`
- The `VOICE_SHARED_SECRET` value.

They configure two server tools, each with the header `x-agent-pledge-secret: <VOICE_SHARED_SECRET>`:

| Tool | Method and URL | Body or path |
|---|---|---|
| `create_task` | `POST <API>/tools/create_task` | JSON `{ description, place, time_limit_minutes, price_usd, caller_phone }` |
| `task_status` | `GET <API>/tools/task_status/{task_id}` | path parameter `task_id` |

`create_task` returns `{ task_id, pin, board_url, status, price, deadline }`. Full contract: `docs/api.md` section 3.1.

### Local agent (our laptop)

The local agent needs the API URL and `AGENT_TOKEN` (header `Authorization: Bearer <AGENT_TOKEN>`; on the WebSocket `wss://<host>/ws/agent?token=<AGENT_TOKEN>`).
Put them in the local agent's `.env` under the names in `apps/local-agent` (see its `.env.example`). The agent's XRPL seed stays on the laptop; it never goes to Render.

### Board and claim page (apps/web)

The board reads `GET <API>/board/state` and the WebSocket `wss://<API host>/ws/board` (docs/api.md section 4).

1. In `render.yaml`, uncomment the `agent-pledge-web` service. Check the build and start commands and the env var names against `apps/web/package.json` and the front end's code (the Blueprint assumes `@agent-pledge/web` and `NEXT_PUBLIC_API_URL`).
2. Push to `main`. Render Dashboard > the `agent-pledge` Blueprint > **Manual Sync** (or it syncs on push). Render asks for `NEXT_PUBLIC_API_URL`: enter the API URL. `NEXT_PUBLIC_*` values are baked in at build time, so change them with a redeploy.
3. On `agent-pledge-api`, make sure `PUBLIC_BASE_URL` is the web URL and `CORS_ORIGINS` contains it (exact origin, `https://`, no trailing slash).
4. Test a claim link on a phone: `<PUBLIC_BASE_URL>/c/<CODE>`.

If the front end is hosted elsewhere (for example Vercel), skip the commented service and do steps 3 and 4 with that URL.

Short URL: `agent-pledge-web.onrender.com` is already short. For a custom domain, add it under the web service's **Settings > Custom Domains** and update `PUBLIC_BASE_URL` and `CORS_ORIGINS`.

## 5. Every environment variable

Source of truth: `apps/server/src/config.ts` and `apps/server/.env.example`.

| Variable | On Render | How to get it |
|---|---|---|
| `NODE_ENV` | `production` (Blueprint) | Turns on the secret check. |
| `LOG_LEVEL` | `info` (Blueprint) | |
| `PORT`, `HOST` | not set | Render sets `PORT` (10000) and the Dockerfile sets `HOST=0.0.0.0`. |
| `DATABASE_URL` | from `agent-pledge-db` (Blueprint) | Internal connection string. Never paste it anywhere public. |
| `LEDGER_MODE` | `fake` (Blueprint) | `xrpl` once `packages/ledger` is ready (section 6). |
| `PLEDGE_AMOUNT` | `1.00` (Blueprint) | |
| `PUBLIC_API_URL` | prompt | This service's URL. NFT URIs and media URLs use it. |
| `PUBLIC_BASE_URL` | prompt | The board's URL. Claim links use it. |
| `CORS_ORIGINS` | prompt | Comma-separated board origins. |
| `VOICE_SHARED_SECRET` | prompt (secret) | `pnpm deploy:secrets`. Shared with the voice teammate. |
| `AGENT_TOKEN` | prompt (secret) | `pnpm deploy:secrets`. Shared with the local agent; also the admin token. |
| `COOKIE_SECRET` | prompt (secret) | `pnpm deploy:secrets`. Signs helper tokens. Server only. |
| `SEED_ENCRYPTION_KEY` | prompt (secret) | `pnpm deploy:secrets`. Encrypts requester and helper seeds in the database. Server only. **Never change it after real wallets exist**: old seeds become unreadable. |
| `VAULT_SEED` | prompt (secret) | xrpl mode. From the crypto teammate (vault wallet). |
| `TREASURY_SEED` | prompt (secret) | xrpl mode. From the crypto teammate (demo treasury that funds requesters). |
| `AGENT_ADDRESS` | prompt | xrpl mode. The local agent's public address (not its seed). |
| `REQUESTER_FUNDING_AMOUNT` | not set | Optional. Empty = the task price. |
| `FAKE_LEDGER_LATENCY_MS`, `FAKE_AGENT_BALANCE` | not set | Fake mode defaults: 300 ms, 100.00. |
| `SCHEDULER_INTERVAL_MS`, `MAX_UPLOAD_BYTES` | not set | Defaults: 2000 ms, 8 MB. |
| `XRPL_NETWORK_URL`, `XRPL_EXPLORER_URL`, `RLUSD_ISSUER`, `RLUSD_CURRENCY` | not set | Testnet defaults in `config.ts`. Set them if the crypto teammate uses another token (PRD section 11). |

The Anthropic API key is used by the local agent on the laptop, not by the server; it does not go to Render.

## 6. Switch to the real ledger

When `packages/ledger` exports `createXrplLedger` (issues #3 to #10), on `agent-pledge-api` > **Environment**:

1. Set `VAULT_SEED`, `TREASURY_SEED`, `AGENT_ADDRESS`.
2. Set `LEDGER_MODE=xrpl`. Save; Render redeploys.
3. `curl $API/health` shows `"ledger_mode":"xrpl"`.
4. Check balances from the laptop: `LEDGER_MODE=xrpl VAULT_SEED=... TREASURY_SEED=... AGENT_ADDRESS=... TREASURY_ADDRESS=... pnpm --dir apps/server exec tsx ../../scripts/demo-reset.ts` (prints balances and clears the local agent state; it does not touch the database).

`pnpm smoke` needs fake mode. In xrpl mode, test with a real call or the local agent.

## 7. Deploys

- Every push to `main` deploys `agent-pledge-api` after the GitHub Actions CI checks pass (`autoDeployTrigger: checksPass`). A failed lint, typecheck, or test blocks the deploy.
- `buildFilter` skips API deploys for commits that only touch other folders (for example `apps/web` or `docs`).
- Manual deploy: the service page > **Manual Deploy** > **Deploy latest commit**. Restart without a build: **Manual Deploy** > **Restart service**.
- Render keeps the old instance running until the new one passes `/health`, so a bad build does not take the API down.
- Logs: the service page > **Logs**.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy fails, log says `Set these secrets in production: ...` | Set the named variables under **Environment**. |
| Deploy fails, log says `Invalid environment: PUBLIC_API_URL: Invalid URL` | Include `https://`. |
| Board shows CORS errors in the browser console | `CORS_ORIGINS` must contain the board's exact origin. |
| Helper token cookie not sent | The front end should send `helper_token` as `Authorization: Bearer` (docs/api.md section 2). |
| WebSocket drops (every deploy or restart closes it) | Clients must reconnect with `?since=<seq>` (docs/api.md section 4). Render supports WebSockets with no extra setup. |
| `LEDGER_MODE=xrpl but @agent-pledge/ledger does not export createXrplLedger yet` | Set `LEDGER_MODE=fake` until the ledger package is merged. |
