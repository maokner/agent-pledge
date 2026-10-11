#!/usr/bin/env bash
# One command brings the whole demo up on this laptop: tunnel, web app, server, local agent,
# phone agent. Runbook: docs/demo-local.md.
#
#   pnpm demo:local                    # xrpl if packages/ledger/.env.testnet exists, else fake
#   pnpm demo:local --mode fake        # simulated ledger
#   pnpm demo:local --no-provision     # do not repoint the ElevenLabs phone agent
#   pnpm demo:local --no-tunnel        # localhost only (implies --no-provision)
#   pnpm demo:local --port 3202        # another server port (default 3002)
#   pnpm demo:local --web-port 3200    # another web app port (default 3000)
#   pnpm demo:local --web-dev          # next dev instead of next build + next start
#   pnpm demo:local --web-url https://www.yopledge.site   # pages hosted elsewhere: claim links go there
#   pnpm demo:local --stop             # stop what this script started
#   pnpm demo:local --restart server   # restart only the server (or: agent, web), keep the tunnel URL
#
# It never prints seeds or secrets. Works with the bash 3.2 that ships with macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="$ROOT/.data/demo"
LOG_DIR="$DEMO_DIR/logs"

SERVER_ENV="$ROOT/apps/server/.env"
AGENT_ENV="$ROOT/apps/local-agent/.env"
VOICE_ENV="$ROOT/apps/voice-agent/.env"
TESTNET_ENV="$ROOT/packages/ledger/.env.testnet"

PHONE_NUMBER="+1 866-808-1262"
EXPECTED_AGENT_ADDRESS="rHg58RwCnQVLoqYyETd4pnA6HsQn5a3RqH"
EXPECTED_VAULT_ADDRESS="rB7wQL1Ft8RHBNdJFmw6tPGrUV8qLRE5Se"

TUNNEL_TIMEOUT=60
WEB_TIMEOUT=120
SERVER_TIMEOUT=120
AGENT_TIMEOUT=60

# Processes in stop order: the agent first, then the server, the web app, and the tunnel.
NAMES="agent server web tunnel"

MODE=""
PORT=3002
WEB_PORT=3000
WEB_DEV=0
TUNNEL=1
PROVISION=1
STOP_ONLY=0
RESTART=""
# Public URL of the web app when it is hosted elsewhere (for example Vercel). Claim links, the
# phone agent's board link, and CORS use it; the API stays on the tunnel URL.
WEB_URL=""

# ---------- output ----------

if [ -t 1 ]; then
  BOLD=$'\033[1m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RESET=$'\033[0m'
else
  BOLD="" RED="" GREEN="" YELLOW="" RESET=""
fi
step() { printf '%s==>%s %s\n' "$BOLD" "$RESET" "$*"; }
ok() { printf '    %sok%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '    %swarning:%s %s\n' "$YELLOW" "$RESET" "$*"; }
die() {
  printf '\n%sERROR:%s %s\n' "$RED" "$RESET" "$1" >&2
  shift
  local line
  for line in "$@"; do printf '       %s\n' "$line" >&2; done
  exit 1
}

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ---------- arguments ----------

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)
      [ $# -ge 2 ] || die "--mode needs a value: fake or xrpl"
      MODE="$2"
      shift 2
      ;;
    --mode=*) MODE="${1#--mode=}"; shift ;;
    --port)
      [ $# -ge 2 ] || die "--port needs a number"
      PORT="$2"
      shift 2
      ;;
    --port=*) PORT="${1#--port=}"; shift ;;
    --web-port)
      [ $# -ge 2 ] || die "--web-port needs a number"
      WEB_PORT="$2"
      shift 2
      ;;
    --web-port=*) WEB_PORT="${1#--web-port=}"; shift ;;
    --web-dev) WEB_DEV=1; shift ;;
    --web-url)
      [ $# -ge 2 ] || die "--web-url needs a URL, for example https://www.yopledge.site"
      WEB_URL="${2%/}"
      shift 2
      ;;
    --web-url=*) WEB_URL="${1#--web-url=}"; WEB_URL="${WEB_URL%/}"; shift ;;
    --no-tunnel) TUNNEL=0; shift ;;
    --no-provision) PROVISION=0; shift ;;
    --stop) STOP_ONLY=1; shift ;;
    --restart)
      [ $# -ge 2 ] || die "--restart needs a value: server, agent or web"
      RESTART="$2"
      shift 2
      ;;
    --restart=*) RESTART="${1#--restart=}"; shift ;;
    -h | --help) usage 0 ;;
    *) printf 'Unknown argument: %s\n\n' "$1" >&2; usage 1 ;;
  esac
done

case "$PORT" in
  '' | *[!0-9]*) die "--port must be a number, got: $PORT" ;;
esac
case "$WEB_PORT" in
  '' | *[!0-9]*) die "--web-port must be a number, got: $WEB_PORT" ;;
esac
[ "$WEB_PORT" != "$PORT" ] || die "--web-port must differ from --port (both are $PORT)"
if [ -z "$MODE" ]; then
  if [ -f "$TESTNET_ENV" ]; then MODE=xrpl; else MODE=fake; fi
fi
case "$MODE" in
  fake | xrpl) ;;
  *) die "--mode must be fake or xrpl, got: $MODE" ;;
esac
if [ "$TUNNEL" = 0 ] && [ "$PROVISION" = 1 ]; then
  PROVISION=0
  PROVISION_SKIPPED_REASON="--no-tunnel (the phone agent needs a public https URL)"
else
  PROVISION_SKIPPED_REASON="--no-provision"
fi

# ---------- env files ----------

# env_get FILE KEY: the value of the last KEY= line, without surrounding quotes. Empty if none.
env_get() {
  [ -f "$1" ] || return 0
  awk -v k="$2" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2) } END { print v }' "$1" |
    sed -E "s/^\"(.*)\"\$/\\1/; s/^'(.*)'\$/\\1/"
}

# env_set FILE KEY VALUE: replace the first KEY= line (drop duplicates), or append one.
# Every other line stays as it is. The value goes through the environment, so no escaping issues.
env_set() {
  local file="$1" tmp
  tmp="$(mktemp "$file.XXXXXX")"
  K="$2" V="$3" awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 }; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

gen_secret() { openssl rand -hex 32; }

# A value that is empty or still the placeholder from an .env.example.
is_placeholder() {
  case "$1" in
    '' | change-me* | dev-only-change-me*) return 0 ;;
    *) return 1 ;;
  esac
}

# Create FILE from its .env.example if it does not exist.
ensure_env_file() {
  local file="$1" example="$1.example"
  if [ ! -f "$file" ]; then
    [ -f "$example" ] || die "Missing $example, so $file cannot be created."
    cp "$example" "$file"
    chmod 600 "$file"
    ok "created ${file#"$ROOT"/} from the example"
  fi
}

# Generate a secret for KEY in FILE if it is still empty or a placeholder.
ensure_secret() {
  local file="$1" key="$2"
  if is_placeholder "$(env_get "$file" "$key")"; then
    env_set "$file" "$key" "$(gen_secret)"
    ok "generated $key in ${file#"$ROOT"/}"
  fi
}

# Derive the classic address of a seed with packages/ledger's xrpl. The seed goes through the
# environment, never argv, so it does not show in ps.
address_of_seed() {
  (cd "$ROOT/packages/ledger" &&
    SEED="$1" node -e 'console.log(require("xrpl").Wallet.fromSeed(process.env.SEED).classicAddress)') 2>/dev/null
}

prepare_env_files() {
  step "Preparing env files (mode: $MODE)"
  ensure_env_file "$SERVER_ENV"
  ensure_env_file "$AGENT_ENV"
  ensure_env_file "$VOICE_ENV"

  ensure_secret "$SERVER_ENV" COOKIE_SECRET
  ensure_secret "$SERVER_ENV" SEED_ENCRYPTION_KEY

  # AGENT_TOKEN: the server's value wins, then the local agent's, else a new one.
  local token
  token="$(env_get "$SERVER_ENV" AGENT_TOKEN)"
  is_placeholder "$token" && token="$(env_get "$AGENT_ENV" AGENT_TOKEN)"
  if is_placeholder "$token"; then
    token="$(gen_secret)"
    ok "generated AGENT_TOKEN"
  fi
  env_set "$SERVER_ENV" AGENT_TOKEN "$token"
  env_set "$AGENT_ENV" AGENT_TOKEN "$token"
  ok "AGENT_TOKEN matches in server and local agent"

  # Voice secret: the voice agent's VOICE_TOOL_SECRET wins, because the ElevenLabs agent was
  # provisioned with it (and keeps it with --no-provision). Then the server's, else a new one.
  local voice
  voice="$(env_get "$VOICE_ENV" VOICE_TOOL_SECRET)"
  if is_placeholder "$voice" || [ "${#voice}" -lt 16 ]; then
    voice="$(env_get "$SERVER_ENV" VOICE_SHARED_SECRET)"
    if is_placeholder "$voice" || [ "${#voice}" -lt 16 ]; then
      voice="$(gen_secret)"
      ok "generated the voice secret"
      if [ "$PROVISION" = 0 ]; then
        warn "the voice secret is new, so the phone agent will be rejected until you run provisioning"
      fi
    fi
    # ElevenLabs keeps the old value of its workspace secret unless provisioning rotates it.
    VOICE_SECRET_CHANGED=1
  fi
  env_set "$SERVER_ENV" VOICE_SHARED_SECRET "$voice"
  env_set "$VOICE_ENV" VOICE_TOOL_SECRET "$voice"
  ok "VOICE_SHARED_SECRET (server) matches VOICE_TOOL_SECRET (voice agent)"

  # URLs and port.
  local local_url="http://localhost:$PORT"
  env_set "$SERVER_ENV" PORT "$PORT"
  env_set "$SERVER_ENV" PUBLIC_BASE_URL "$(base_url)"
  env_set "$SERVER_ENV" PUBLIC_API_URL "$PUBLIC_URL"
  if [ "$PUBLIC_URL" = "$local_url" ]; then
    cors="$local_url"
  else
    cors="$PUBLIC_URL,$local_url"
  fi
  [ -z "$WEB_URL" ] || cors="$WEB_URL,$cors"
  env_set "$SERVER_ENV" CORS_ORIGINS "$cors"
  env_set "$SERVER_ENV" WEB_UPSTREAM_URL "$(web_upstream)"
  env_set "$AGENT_ENV" SERVER_URL "$local_url"
  env_set "$AGENT_ENV" SERVER_WS_URL "ws://localhost:$PORT/ws/agent"
  if [ "$TUNNEL" = 1 ]; then
    env_set "$VOICE_ENV" PUBLIC_BASE_URL "$(base_url)"
  fi
  ok "PUBLIC_API_URL -> $PUBLIC_URL"
  ok "PUBLIC_BASE_URL (claim links, board link) -> $(base_url); CORS_ORIGINS -> $cors"
  ok "WEB_UPSTREAM_URL -> $(web_upstream) (the server proxies the web app)"

  # Ledger mode.
  env_set "$SERVER_ENV" LEDGER_MODE "$MODE"
  env_set "$AGENT_ENV" LEDGER_MODE "$MODE"
  if [ "$MODE" = xrpl ]; then
    [ -f "$TESTNET_ENV" ] || die "--mode xrpl needs $TESTNET_ENV (the wallet seeds)." \
      "Copy it onto this laptop, or run with --mode fake."
    local vault_seed agent_seed requester_seed vault_addr agent_addr
    vault_seed="$(env_get "$TESTNET_ENV" XRPL_VAULT_SEED)"
    agent_seed="$(env_get "$TESTNET_ENV" XRPL_AGENT_SEED)"
    requester_seed="$(env_get "$TESTNET_ENV" XRPL_REQUESTER_SEED)"
    [ -n "$vault_seed" ] || die "XRPL_VAULT_SEED is empty in $TESTNET_ENV"
    [ -n "$agent_seed" ] || die "XRPL_AGENT_SEED is empty in $TESTNET_ENV"
    [ -n "$requester_seed" ] || die "XRPL_REQUESTER_SEED is empty in $TESTNET_ENV"

    vault_addr="$(address_of_seed "$vault_seed")" || die "XRPL_VAULT_SEED in $TESTNET_ENV is not a valid seed."
    agent_addr="$(address_of_seed "$agent_seed")" || die "XRPL_AGENT_SEED in $TESTNET_ENV is not a valid seed."
    [ "$vault_addr" = "$EXPECTED_VAULT_ADDRESS" ] ||
      warn "the vault seed is for $vault_addr, not the expected $EXPECTED_VAULT_ADDRESS (using $vault_addr)"
    [ "$agent_addr" = "$EXPECTED_AGENT_ADDRESS" ] ||
      warn "the agent seed is for $agent_addr, not the expected $EXPECTED_AGENT_ADDRESS (using $agent_addr)"

    env_set "$SERVER_ENV" VAULT_SEED "$vault_seed"
    env_set "$SERVER_ENV" TREASURY_SEED "$requester_seed"
    env_set "$SERVER_ENV" AGENT_ADDRESS "$agent_addr"
    env_set "$AGENT_ENV" AGENT_SEED "$agent_seed"
    env_set "$AGENT_ENV" VAULT_ADDRESS "$vault_addr"

    # A self-issued fallback token overrides RLUSD (packages/ledger/README.md).
    local issuer currency
    issuer="$(env_get "$TESTNET_ENV" XRPL_TOKEN_ISSUER)"
    currency="$(env_get "$TESTNET_ENV" XRPL_TOKEN_CURRENCY)"
    if [ -n "$issuer" ]; then
      env_set "$SERVER_ENV" RLUSD_ISSUER "$issuer"
      env_set "$AGENT_ENV" RLUSD_ISSUER "$issuer"
    fi
    if [ -n "$currency" ]; then
      env_set "$SERVER_ENV" RLUSD_CURRENCY "$currency"
      env_set "$AGENT_ENV" RLUSD_CURRENCY "$currency"
    fi
    ok "xrpl wallets: vault $vault_addr, agent $agent_addr, treasury = requester (seeds not shown)"
  fi
}

# ---------- processes ----------

pid_file() { echo "$DEMO_DIR/$1.pid"; }
log_file() { echo "$LOG_DIR/$1.log"; }

is_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

# Start a command in its own process group (set -m), detached from this shell (nohup, no stdin),
# with output to the log. The pid file holds the group leader, so --stop can kill the whole tree
# (pnpm -> tsx -> node).
start_bg() {
  local name="$1" log
  shift
  log="$(log_file "$name")"
  [ -f "$log" ] && mv "$log" "$LOG_DIR/$name.prev.log"
  set -m
  nohup "$@" >"$log" 2>&1 </dev/null &
  echo $! >"$(pid_file "$name")"
  set +m
}

stop_one() {
  local name="$1" file pid i
  file="$(pid_file "$name")"
  [ -f "$file" ] || return 0
  pid="$(cat "$file")"
  if is_alive "$pid"; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for i in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 -- "-$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 -- "-$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
      ok "killed $name (pid $pid, forced)"
    else
      ok "stopped $name (pid $pid)"
    fi
  else
    ok "$name was not running (stale pid file)"
  fi
  rm -f "$file"
}

stop_all() {
  local name any=0
  for name in $NAMES; do [ -f "$(pid_file "$name")" ] && any=1; done
  [ "$any" = 1 ] || return 0
  step "Stopping what the last run started"
  for name in $NAMES; do stop_one "$name"; done
}

# The pid listening on a TCP port, if any.
port_owner() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true; }

# wait_for SECONDS NAME CHECK...: run CHECK every second until it passes. Fails early if the
# process NAME exits.
wait_for() {
  local timeout="$1" name="$2" i pid
  shift 2
  pid="$(cat "$(pid_file "$name")")"
  for ((i = 0; i < timeout; i++)); do
    if "$@"; then return 0; fi
    is_alive "$pid" || return 2
    sleep 1
  done
  return 1
}

show_log_tail() {
  local log
  log="$(log_file "$1")"
  printf '\n--- last 25 lines of %s ---\n' "$log" >&2
  tail -n 25 "$log" >&2 || true
  printf -- '---\n' >&2
}

# ---------- tunnel ----------

tunnel_url_from_log() {
  grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$(log_file tunnel)" 2>/dev/null |
    grep -v '^https://api\.' | head -1
}
have_tunnel_url() { [ -n "$(tunnel_url_from_log)" ]; }

start_tunnel() {
  step "Starting the cloudflared quick tunnel to localhost:$PORT"
  command -v cloudflared >/dev/null 2>&1 ||
    die "cloudflared is not installed." "Install it with: brew install cloudflared" \
      "Or run without a public URL: pnpm demo:local --no-tunnel"
  start_bg tunnel cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate
  local rc=0
  wait_for "$TUNNEL_TIMEOUT" tunnel have_tunnel_url || rc=$?
  if [ "$rc" != 0 ]; then
    show_log_tail tunnel
    [ "$rc" = 2 ] && die "cloudflared exited before it printed a tunnel URL." \
      "Check the log above. A ~/.cloudflared/config.yml can break quick tunnels: move it away and retry."
    die "No trycloudflare.com URL from cloudflared after ${TUNNEL_TIMEOUT}s." \
      "Cloudflare quick tunnels are sometimes slow or rate limited: run the command again."
  fi
  PUBLIC_URL="$(tunnel_url_from_log)"
  ok "tunnel URL: $PUBLIC_URL"
}

# GET URL/health through the tunnel. A brand-new trycloudflare hostname can be missing from the
# local DNS cache for a while, so also try with the address from 1.1.1.1.
tunnel_health_ok() {
  curl -fsS -m 5 "$PUBLIC_URL/health" >/dev/null 2>&1 && return 0
  local host ip
  host="${PUBLIC_URL#https://}"
  ip="$(dig +short @1.1.1.1 "$host" A 2>/dev/null | grep -E '^[0-9.]+$' | head -1)"
  [ -n "$ip" ] && curl -fsS -m 5 --resolve "$host:443:$ip" "$PUBLIC_URL/health" >/dev/null 2>&1
}

# ---------- web app ----------

# The Next.js app listens on loopback only: people reach it through the server's proxy, on the
# server's port or the tunnel, so the pages, the API and /ws/board share one origin.
web_upstream() { echo "http://127.0.0.1:$WEB_PORT"; }
# Where the pages live for claim links and the phone agent's board link: the hosted web app when
# --web-url is given, else the tunnel (or localhost), where the server proxies the web app.
base_url() { echo "${WEB_URL:-$PUBLIC_URL}"; }
web_healthy() { curl -fsS -o /dev/null -m 5 "$(web_upstream)/board" 2>/dev/null; }

# Env for both next build and next start, exported (never on a command line, so the secret does
# not show in ps; the other children ignore these). The empty NEXT_PUBLIC_* values win over any
# apps/web/.env.local (Next.js never overrides the process env): no fixtures, and the browser calls
# the API and /ws/board on the page's own origin. The backup form's route handler reaches the server
# directly with the voice secret; its passcode comes from apps/web/.env.local, if set.
export_web_env() {
  export NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_FIXTURES="" NEXT_PUBLIC_API_URL="" NEXT_PUBLIC_WS_URL=""
  export AGENT_PLEDGE_SERVER_URL="http://127.0.0.1:$PORT"
  # Like the server: an exported VOICE_SHARED_SECRET wins over apps/server/.env.
  AGENT_PLEDGE_VOICE_SECRET="${VOICE_SHARED_SECRET:-$(env_get "$SERVER_ENV" VOICE_SHARED_SECRET)}"
  export AGENT_PLEDGE_VOICE_SECRET
}

start_web() {
  export_web_env
  if [ "$WEB_DEV" = 1 ]; then
    step "Starting the web app (next dev) on 127.0.0.1:$WEB_PORT"
    start_bg web pnpm --dir "$ROOT/apps/web" exec next dev --port "$WEB_PORT" --hostname 127.0.0.1
  else
    step "Building the web app (next build)"
    local build_log rc=0
    build_log="$(log_file web-build)"
    pnpm --dir "$ROOT/apps/web" exec next build >"$build_log" 2>&1 </dev/null || rc=$?
    if [ "$rc" != 0 ]; then
      printf '\n--- last 25 lines of %s ---\n' "$build_log" >&2
      tail -n 25 "$build_log" >&2 || true
      die "next build failed (exit $rc). Log: $build_log"
    fi
    ok "built (log: $build_log)"
    step "Starting the web app (next start) on 127.0.0.1:$WEB_PORT"
    start_bg web pnpm --dir "$ROOT/apps/web" exec next start --port "$WEB_PORT" --hostname 127.0.0.1
  fi
  local rc=0
  wait_for "$WEB_TIMEOUT" web web_healthy || rc=$?
  if [ "$rc" != 0 ]; then
    show_log_tail web
    [ "$rc" = 2 ] && die "The web app exited during startup. See the log above: $(log_file web)"
    die "The web app did not answer $(web_upstream)/board within ${WEB_TIMEOUT}s." "Log: $(log_file web)"
  fi
  ok "web app answers at $(web_upstream)"
  [ -n "$(env_get "$ROOT/apps/web/.env.local" BACKUP_FORM_PASSCODE)" ] ||
    warn "BACKUP_FORM_PASSCODE is not set in apps/web/.env.local, so the board's backup form is off"
}

# ---------- server and agent ----------

server_health() { curl -fsS -m 3 "http://localhost:$PORT/health" 2>/dev/null; }
server_healthy() { server_health >/dev/null; }

start_server() {
  step "Starting the server on port $PORT"
  # The env values on the command line win over the .env file (dotenv does not override), so a
  # stray export in this shell cannot point the server somewhere else.
  start_bg server env PORT="$PORT" LEDGER_MODE="$MODE" PUBLIC_BASE_URL="$(base_url)" \
    PUBLIC_API_URL="$PUBLIC_URL" WEB_UPSTREAM_URL="$(web_upstream)" \
    pnpm --dir "$ROOT" --filter @agent-pledge/server start
  local rc=0
  wait_for "$SERVER_TIMEOUT" server server_healthy || rc=$?
  if [ "$rc" != 0 ]; then
    show_log_tail server
    [ "$rc" = 2 ] && die "The server exited during startup. See the log above: $(log_file server)"
    die "The server did not answer http://localhost:$PORT/health within ${SERVER_TIMEOUT}s." \
      "Log: $(log_file server)"
  fi
  local health ledger_mode
  health="$(server_health)"
  ledger_mode="$(printf '%s' "$health" | sed -nE 's/.*"ledger_mode":"([a-z]+)".*/\1/p')"
  ok "health: $health"
  [ "$ledger_mode" = "$MODE" ] ||
    die "The server runs ledger_mode=$ledger_mode, but this run asked for $MODE." "Log: $(log_file server)"
  ok "ledger_mode: $ledger_mode"

  # The board through the server's proxy. /?task=<id> (the server's board_url) redirects to it.
  local board_status
  board_status="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://localhost:$PORT/board" || true)"
  if [ "$board_status" = 200 ]; then
    ok "board page served through the server at /board"
    BOARD_OK=1
  else
    warn "GET /board returned $board_status: the server does not reach the web app at $(web_upstream)"
    BOARD_OK=0
  fi

  if [ "$TUNNEL" = 1 ]; then
    rc=0
    wait_for 60 tunnel tunnel_health_ok || rc=$?
    [ "$rc" = 0 ] || {
      show_log_tail tunnel
      die "The server is up, but $PUBLIC_URL/health does not answer through the tunnel." \
        "Run the command again to get a new tunnel."
    }
    ok "reachable through the tunnel: $PUBLIC_URL/health"
  fi
}

hello_count() { grep -c 'local agent hello' "$(log_file server)" 2>/dev/null || true; }

# The agent log says "[ws] open", or the server log has a new "local agent hello".
agent_connected() {
  grep -q '\[ws\] open' "$(log_file agent)" 2>/dev/null && return 0
  [ "$(hello_count)" -gt "${HELLO_BASE:-0}" ] 2>/dev/null
}

start_agent() {
  step "Starting the local agent"
  HELLO_BASE="$(hello_count)"
  HELLO_BASE="${HELLO_BASE:-0}"
  start_bg agent env SERVER_URL="http://localhost:$PORT" SERVER_WS_URL="ws://localhost:$PORT/ws/agent" \
    LEDGER_MODE="$MODE" pnpm --dir "$ROOT" --filter @agent-pledge/local-agent start
  local rc=0
  wait_for "$AGENT_TIMEOUT" agent agent_connected || rc=$?
  if [ "$rc" != 0 ]; then
    show_log_tail agent
    [ "$rc" = 2 ] && die "The local agent exited during startup. See the log above: $(log_file agent)"
    die "The local agent did not connect to ws://localhost:$PORT/ws/agent within ${AGENT_TIMEOUT}s." \
      "Check AGENT_TOKEN in apps/local-agent/.env and apps/server/.env. Log: $(log_file agent)"
  fi
  ok "agent WebSocket connected"
}

# ---------- voice ----------

provision_voice() {
  if [ "$PROVISION" = 0 ]; then
    step "Skipping phone agent provisioning ($PROVISION_SKIPPED_REASON)"
    return 0
  fi
  step "Repointing the ElevenLabs phone agent to $PUBLIC_URL"
  [ -n "$(env_get "$VOICE_ENV" ELEVENLABS_API_KEY)" ] ||
    die "ELEVENLABS_API_KEY is empty in apps/voice-agent/.env, so the phone agent cannot be repointed." \
      "Fill it in, or run with --no-provision."
  local log rc=0 args=""
  if [ "${VOICE_SECRET_CHANGED:-0}" = 1 ]; then
    # The voice agent had no VOICE_TOOL_SECRET, so ElevenLabs must get the new one.
    args="--rotate-secret"
    warn "VOICE_TOOL_SECRET is new: provisioning with --rotate-secret (replaces the ElevenLabs workspace secret)"
  fi
  log="$(log_file provision)"
  # shellcheck disable=SC2086
  (cd "$ROOT/apps/voice-agent" && env PUBLIC_BASE_URL="$(base_url)" pnpm provision $args) >"$log" 2>&1 </dev/null || rc=$?
  sed 's/^/    | /' "$log"
  [ "$rc" = 0 ] || die "Phone agent provisioning failed (exit $rc). Log: $log" \
    "The server and agent are still running. Fix it and run: cd apps/voice-agent && pnpm provision"
  ok "phone agent points at $PUBLIC_URL"
}

# ---------- main ----------

mkdir -p "$LOG_DIR"
cd "$ROOT"

# --restart: restart one process with the current env files, so the tunnel URL (and with it the
# phone agent, the projector tab, and posted claim links) stays the same.
if [ -n "$RESTART" ]; then
  case "$RESTART" in
    server | agent | web) ;;
    *) die "--restart must be server, agent or web, got: $RESTART" ;;
  esac
  [ -f "$SERVER_ENV" ] || die "No apps/server/.env yet. Run pnpm demo:local first."
  PORT="$(env_get "$SERVER_ENV" PORT)"
  MODE="$(env_get "$SERVER_ENV" LEDGER_MODE)"
  PUBLIC_URL="$(env_get "$SERVER_ENV" PUBLIC_API_URL)"
  if [ -z "$WEB_URL" ]; then
    saved_base="$(env_get "$SERVER_ENV" PUBLIC_BASE_URL)"
    [ "$saved_base" = "$PUBLIC_URL" ] || WEB_URL="$saved_base"
  fi
  upstream="$(env_get "$SERVER_ENV" WEB_UPSTREAM_URL)"
  case "$upstream" in
    http://127.0.0.1:*) WEB_PORT="${upstream##*:}" ;;
  esac
  TUNNEL=0
  if [ -f "$(pid_file tunnel)" ] && is_alive "$(cat "$(pid_file tunnel)")"; then
    case "$PUBLIC_URL" in https://*) TUNNEL=1 ;; esac
  fi
  [ "$TUNNEL" = 1 ] || warn "the tunnel from the last run is not running: the phone and the public board cannot reach the server. Run pnpm demo:local for a new one."
  step "Restarting the $RESTART (port $PORT, mode $MODE, URL $PUBLIC_URL)"
  stop_one "$RESTART"
  if [ "$RESTART" = server ]; then
    owner="$(port_owner "$PORT")"
    [ -z "$owner" ] || die "Port $PORT is still in use by pid $owner. Stop it (kill $owner) and retry."
    start_server
    if [ -f "$(pid_file agent)" ] && is_alive "$(cat "$(pid_file agent)")"; then
      ok "the local agent reconnects by itself (watch for [ws] open in $(log_file agent))"
    else
      warn "the local agent is not running: pnpm demo:local --restart agent"
    fi
  elif [ "$RESTART" = web ]; then
    owner="$(port_owner "$WEB_PORT")"
    [ -z "$owner" ] || die "Port $WEB_PORT is still in use by pid $owner. Stop it (kill $owner) and retry."
    start_web
  else
    start_agent
  fi
  step "Restarted the $RESTART. Board: $PUBLIC_URL/board"
  exit 0
fi

stop_all
if [ "$STOP_ONLY" = 1 ]; then
  step "Stopped. Nothing from this script is running."
  exit 0
fi

step "Pre-flight"
for cmd in pnpm node curl openssl lsof; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not installed or not on PATH."
done
owner="$(port_owner "$PORT")"
if [ -n "$owner" ]; then
  die "Port $PORT is already in use by pid $owner: $(ps -o command= -p "$owner" 2>/dev/null | cut -c1-120)" \
    "If it is an old demo server started by hand, stop it: kill $owner" \
    "Or use another port: pnpm demo:local --port 3202"
fi
ok "port $PORT is free"
owner="$(port_owner "$WEB_PORT")"
if [ -n "$owner" ]; then
  die "Port $WEB_PORT (web app) is already in use by pid $owner: $(ps -o command= -p "$owner" 2>/dev/null | cut -c1-120)" \
    "If it is an old web app started by hand, stop it: kill $owner" \
    "Or use another port: pnpm demo:local --web-port 3200"
fi
ok "port $WEB_PORT is free"

# A local agent started by hand would also connect to the new server and race ours for tasks.
stray_agents="$(pgrep -f "$ROOT/apps/local-agent/.*src/index.ts" 2>/dev/null | tr '\n' ' ' || true)"
if [ -n "${stray_agents// /}" ]; then
  die "A local agent from this checkout is already running (pid ${stray_agents% }), not started by this script." \
    "Two agents would race for the same tasks. Stop it first: kill ${stray_agents% }"
fi
ok "no other local agent running"
stray_tunnels="$(pgrep -f "cloudflared tunnel --url http://localhost:$PORT( |\$)" 2>/dev/null | tr '\n' ' ' || true)"
if [ -n "${stray_tunnels// /}" ]; then
  warn "an older tunnel to port $PORT is still running (pid ${stray_tunnels% }). Its URL goes stale. Stop it: kill ${stray_tunnels% }"
fi

# If any later step fails, stop what this run started so the next run starts clean.
cleanup_on_error() {
  local rc=$?
  if [ "$rc" != 0 ] && [ "${STARTED:-0}" = 1 ]; then
    printf '\nStopping what this run started...\n' >&2
    stop_all >&2 || true
  fi
}
trap cleanup_on_error EXIT
STARTED=1

if [ "$TUNNEL" = 1 ]; then
  start_tunnel
else
  PUBLIC_URL="http://localhost:$PORT"
  step "No tunnel: everything is on $PUBLIC_URL (the phone cannot reach it)"
fi

prepare_env_files
start_web
start_server
start_agent
provision_voice

trap - EXIT

if [ "$PROVISION" = 1 ]; then
  phone_line="$PHONE_NUMBER (repointed to this tunnel)"
elif [ "$TUNNEL" = 1 ]; then
  phone_line="$PHONE_NUMBER (NOT repointed: it still calls the URL from the last provisioning)"
else
  phone_line="$PHONE_NUMBER (NOT reachable: no tunnel)"
fi
board_line="$PUBLIC_URL/board"
[ "${BOARD_OK:-0}" = 1 ] || board_line="$PUBLIC_URL/board   (NOT served: see the web log)"
if [ "$WEB_DEV" = 1 ]; then web_kind="next dev"; else web_kind="next start"; fi
web_url_line=""
[ -z "$WEB_URL" ] || web_url_line="
  Web (hosted): $WEB_URL  (set NEXT_PUBLIC_API_URL=$PUBLIC_URL there)"
tunnel_log_line=""
[ "$TUNNEL" = 1 ] && tunnel_log_line="
                $(log_file tunnel)"

cat <<EOF

${GREEN}${BOLD}Demo is up${RESET} (ledger: $MODE)

  Board:        $board_line
  Board local:  http://localhost:$PORT/board
  Claim links:  $(base_url)/c/<CODE>${web_url_line}
  Phone:        $phone_line
  Health:       $PUBLIC_URL/health
  Web app:      $(web_upstream) ($web_kind, reached through the server)
  Logs:         $(log_file server)
                $(log_file agent)
                $(log_file web)${tunnel_log_line}
  Follow logs:  tail -f $LOG_DIR/*.log
  Stop:         pnpm demo:local --stop

EOF
