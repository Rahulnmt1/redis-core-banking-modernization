#!/usr/bin/env bash
# Demo controller — start / stop / restart / status for all four layers.
#
# Layers:
#   containers : Postgres + Redis Enterprise (via docker compose)
#   backend    : Node Express API on :4000  (PID file under .run/backend.pid)
#   frontend   : Vite dev server on :5173   (PID file under .run/frontend.pid)
#
# Usage:
#   ./demo.sh up                bring everything up (default)
#   ./demo.sh down              stop everything (preserves data)
#   ./demo.sh restart           full restart
#   ./demo.sh status            health check across all layers
#   ./demo.sh reset             ⚠ wipe Postgres + Redis volumes, then up clean
#   ./demo.sh logs <layer>      tail logs (backend|frontend|postgres|redis)
#
#   ./demo.sh containers up|down|restart|status
#   ./demo.sh backend    start|stop|restart|status
#   ./demo.sh frontend   start|stop|restart|status

set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

# ─── colours ────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RED=$'\033[0;31m';  C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[0;33m'
  C_BLUE=$'\033[0;34m'; C_DIM=$'\033[2m';      C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_DIM=""; C_BOLD=""; C_RESET=""
fi
ok()   { printf "  ${C_GREEN}✓${C_RESET} %s\n" "$*"; }
fail() { printf "  ${C_RED}✗${C_RESET} %s\n" "$*"; }
warn() { printf "  ${C_YELLOW}!${C_RESET} %s\n" "$*"; }
step() { printf "${C_BOLD}${C_BLUE}▸${C_RESET} %s\n" "$*"; }
sub()  { printf "${C_DIM}    %s${C_RESET}\n" "$*"; }

# ─── helpers ────────────────────────────────────────────────────────────────
have_cmd() { command -v "$1" >/dev/null 2>&1; }

require_docker() {
  if ! have_cmd docker; then
    fail "docker not found in PATH"; exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    fail "docker daemon not running — start Docker Desktop first"; exit 1
  fi
}

# Wait until command 'cmd args…' returns 0, with optional sentinel echo.
# Args: <max-secs> <label> <cmd…>
wait_for() {
  local max="$1"; shift
  local label="$1"; shift
  local i=0
  while ! "$@" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge "$max" ]; then
      fail "$label still not ready after ${max}s"; return 1
    fi
    sleep 1
  done
  ok "$label ready (after ${i}s)"
}

# ─── containers ─────────────────────────────────────────────────────────────
containers_up() {
  require_docker
  step "Bringing up containers (Postgres + Redis Enterprise)…"
  ( cd "$ROOT" && docker compose up -d )

  step "Waiting for Postgres on 5433…"
  wait_for 60 "Postgres" docker exec cbs-postgres pg_isready -U cbs -d cbs || return 1

  step "Waiting for Redis Enterprise REST on 9443 (first boot can take 60–90 s)…"
  for i in $(seq 1 120); do
    code=$(docker exec cbs-redis-enterprise curl -sk -o /dev/null -w "%{http_code}" \
            https://localhost:9443/v1/bootstrap 2>/dev/null || echo 000)
    if [ "$code" = "200" ] || [ "$code" = "401" ]; then
      ok "Redis Enterprise REST up (after ${i}s, http=$code)"
      break
    fi
    if [ "$i" -ge 120 ]; then fail "Redis Enterprise REST did not come up in 240 s"; return 1; fi
    sleep 2
  done

  step "Bootstrapping Redis Enterprise cluster + cbs-cache database (idempotent)…"
  bash "$ROOT/infra/setup.sh" >"$RUN_DIR/setup.log" 2>&1
  ok "infra/setup.sh complete (log: .run/setup.log)"

  step "Smoke test — PING the cbs-cache database on :12000…"
  if docker run --rm --network host redis:7-alpine redis-cli -p 12000 ping 2>/dev/null | grep -q PONG; then
    ok "cbs-cache responds to PING"
  else
    fail "cbs-cache did not respond to PING"; return 1
  fi
}

containers_down() {
  require_docker
  step "Stopping containers (volumes preserved)…"
  ( cd "$ROOT" && docker compose stop ) || true
  ok "containers stopped"
}

containers_restart() {
  containers_down
  containers_up
}

containers_status() {
  require_docker
  step "Containers"
  for name in cbs-postgres cbs-redis-enterprise; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qw "$name"; then
      health=$(docker inspect -f '{{.State.Health.Status}}' "$name" 2>/dev/null || echo unknown)
      uptime=$(docker inspect -f '{{.State.StartedAt}}' "$name" 2>/dev/null || echo "")
      ok "$name · health=$health · started=$uptime"
    else
      fail "$name not running"
    fi
  done

  if docker exec cbs-postgres pg_isready -U cbs -d cbs >/dev/null 2>&1; then
    ok "Postgres pg_isready → ready"
  else
    fail "Postgres not ready"
  fi

  if docker run --rm --network host redis:7-alpine redis-cli -p 12000 ping 2>/dev/null | grep -q PONG; then
    ok "cbs-cache PING → PONG"
  else
    fail "cbs-cache not responding on :12000"
  fi
}

# ─── backend ────────────────────────────────────────────────────────────────
backend_start() {
  if backend_is_running; then
    warn "backend already running (pid $(cat "$RUN_DIR/backend.pid"))"
    return 0
  fi
  step "Starting backend (http://localhost:4000)…"
  if [ ! -d "$ROOT/backend/node_modules" ]; then
    sub "running npm install in backend/ …"
    ( cd "$ROOT/backend" && npm install --silent )
  fi
  ( cd "$ROOT/backend" && nohup node src/server.js >"$RUN_DIR/backend.log" 2>&1 & echo $! >"$RUN_DIR/backend.pid" )
  step "Waiting for backend health endpoint…"
  for i in $(seq 1 60); do
    if curl -fs http://localhost:4000/api/health >/dev/null 2>&1; then
      ok "backend ready (after ${i}s) — http://localhost:4000"
      sub "log: .run/backend.log · pid: $(cat "$RUN_DIR/backend.pid")"
      return 0
    fi
    sleep 1
  done
  fail "backend did not become healthy in 60 s"
  sub "tail of .run/backend.log:"
  tail -n 20 "$RUN_DIR/backend.log" | sed 's/^/      /'
  return 1
}

backend_stop() {
  if [ -f "$RUN_DIR/backend.pid" ]; then
    pid=$(cat "$RUN_DIR/backend.pid")
    if kill -0 "$pid" 2>/dev/null; then
      step "Stopping backend (pid $pid)…"
      kill "$pid" 2>/dev/null || true
      for i in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 "$pid" 2>/dev/null || true
      ok "backend stopped"
    fi
    rm -f "$RUN_DIR/backend.pid"
  fi
  # Catch any stragglers (e.g. started outside this script)
  pkill -f 'node src/server.js' 2>/dev/null || true
}

backend_restart() {
  backend_stop
  backend_start
}

backend_is_running() {
  [ -f "$RUN_DIR/backend.pid" ] && kill -0 "$(cat "$RUN_DIR/backend.pid")" 2>/dev/null
}

backend_status() {
  step "Backend"
  if backend_is_running; then
    pid=$(cat "$RUN_DIR/backend.pid")
    ok "process running (pid $pid)"
  else
    fail "process not running"
  fi
  if curl -fs http://localhost:4000/api/health >/dev/null 2>&1; then
    health=$(curl -s http://localhost:4000/api/health)
    ok "GET /api/health → $health"
  else
    fail "GET /api/health unreachable on :4000"
  fi
  if curl -fs http://localhost:4000/api/customers/stats >/dev/null 2>&1; then
    sub "$(curl -s http://localhost:4000/api/customers/stats)"
  fi
}

# ─── frontend ───────────────────────────────────────────────────────────────
frontend_start() {
  if frontend_is_running; then
    warn "frontend already running (pid $(cat "$RUN_DIR/frontend.pid"))"
    return 0
  fi
  step "Starting frontend (http://localhost:5173)…"
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    sub "running npm install in frontend/ …"
    ( cd "$ROOT/frontend" && npm install --silent )
  fi
  ( cd "$ROOT/frontend" && nohup npm run dev >"$RUN_DIR/frontend.log" 2>&1 & echo $! >"$RUN_DIR/frontend.pid" )
  step "Waiting for Vite dev server…"
  for i in $(seq 1 60); do
    if curl -fsI http://localhost:5173 2>/dev/null | head -1 | grep -q '200 OK'; then
      ok "frontend ready (after ${i}s) — http://localhost:5173"
      sub "log: .run/frontend.log · pid: $(cat "$RUN_DIR/frontend.pid")"
      return 0
    fi
    sleep 1
  done
  fail "frontend did not respond on :5173 within 60 s"
  sub "tail of .run/frontend.log:"
  tail -n 20 "$RUN_DIR/frontend.log" | sed 's/^/      /'
  return 1
}

frontend_stop() {
  if [ -f "$RUN_DIR/frontend.pid" ]; then
    pid=$(cat "$RUN_DIR/frontend.pid")
    if kill -0 "$pid" 2>/dev/null; then
      step "Stopping frontend (pid $pid)…"
      # Vite spawns child processes; kill the whole group.
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      for i in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 "$pid" 2>/dev/null || true
      ok "frontend stopped"
    fi
    rm -f "$RUN_DIR/frontend.pid"
  fi
  pkill -f 'vite' 2>/dev/null || true
}

frontend_restart() {
  frontend_stop
  frontend_start
}

frontend_is_running() {
  [ -f "$RUN_DIR/frontend.pid" ] && kill -0 "$(cat "$RUN_DIR/frontend.pid")" 2>/dev/null
}

frontend_status() {
  step "Frontend"
  if frontend_is_running; then
    pid=$(cat "$RUN_DIR/frontend.pid")
    ok "process running (pid $pid)"
  else
    fail "process not running"
  fi
  if curl -fsI http://localhost:5173 2>/dev/null | head -1 | grep -q '200 OK'; then
    ok "GET / → 200 OK on :5173"
  else
    fail "GET / unreachable on :5173"
  fi
}

# ─── high-level commands ────────────────────────────────────────────────────
up_all() {
  containers_up || return 1
  backend_start || return 1
  frontend_start || return 1
  banner
}

down_all() {
  frontend_stop
  backend_stop
  containers_down
}

restart_all() {
  down_all
  up_all
}

status_all() {
  containers_status
  echo
  backend_status
  echo
  frontend_status
}

reset_all() {
  printf "${C_YELLOW}⚠ This will remove Postgres + Redis Enterprise volumes (50 k customers will be re-seeded).${C_RESET}\n"
  printf "Type 'yes' to continue: "
  read -r ans
  [ "$ans" = "yes" ] || { warn "aborted"; return 0; }
  frontend_stop
  backend_stop
  step "docker compose down -v…"
  ( cd "$ROOT" && docker compose down -v ) || true
  ok "volumes removed"
  up_all
}

logs() {
  case "${1:-}" in
    backend)   tail -f "$RUN_DIR/backend.log" ;;
    frontend)  tail -f "$RUN_DIR/frontend.log" ;;
    postgres)  docker logs -f cbs-postgres ;;
    redis|re)  docker logs -f cbs-redis-enterprise ;;
    *) echo "logs <backend|frontend|postgres|redis>"; return 1 ;;
  esac
}

banner() {
  cat <<EOF

  ${C_BOLD}─────────────────────────────────────────────────────────${C_RESET}
   ${C_GREEN}Demo running${C_RESET}:
     • Dashboard           : http://localhost:5173
     • API                 : http://localhost:4000
     • Redis Enterprise UI : https://localhost:8443  (demo@redis.com / Redis123!)
     • Redis CLI           : redis-cli -p 12000
     • Postgres            : psql postgres://cbs:cbs@127.0.0.1:5433/cbs
  ${C_BOLD}─────────────────────────────────────────────────────────${C_RESET}

   logs : ./demo.sh logs <backend|frontend|postgres|redis>
   stop : ./demo.sh down
   reset: ./demo.sh reset

EOF
}

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \?//'
}

# ─── dispatcher ─────────────────────────────────────────────────────────────
cmd="${1:-up}"
case "$cmd" in
  up|start)        up_all ;;
  down|stop)       down_all ;;
  restart)         restart_all ;;
  status|ps)       status_all ;;
  reset)           reset_all ;;
  logs)            shift; logs "${1:-}" ;;
  containers)      shift
                   case "${1:-status}" in
                     up|start)      containers_up ;;
                     down|stop)     containers_down ;;
                     restart)       containers_restart ;;
                     status|ps)     containers_status ;;
                     *) echo "containers <up|down|restart|status>"; exit 1 ;;
                   esac
                   ;;
  backend)         shift
                   case "${1:-status}" in
                     start|up)      backend_start ;;
                     stop|down)     backend_stop ;;
                     restart)       backend_restart ;;
                     status|ps)     backend_status ;;
                     *) echo "backend <start|stop|restart|status>"; exit 1 ;;
                   esac
                   ;;
  frontend)        shift
                   case "${1:-status}" in
                     start|up)      frontend_start ;;
                     stop|down)     frontend_stop ;;
                     restart)       frontend_restart ;;
                     status|ps)     frontend_status ;;
                     *) echo "frontend <start|stop|restart|status>"; exit 1 ;;
                   esac
                   ;;
  -h|--help|help)  usage ;;
  *)               echo "unknown command: $cmd"; usage; exit 1 ;;
esac
