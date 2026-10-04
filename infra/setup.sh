#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELP="$ROOT/infra/_re_helpers.py"

CLUSTER_USER="demo@redis.com"
CLUSTER_PASS='Redis123!'
DB_NAME="cbs-cache"
DB_PORT=12000

CURL_RE() {
  docker exec cbs-redis-enterprise curl -sk "$@"
}
CURL_RE_AUTH() {
  CURL_RE -u "$CLUSTER_USER:$CLUSTER_PASS" "$@"
}

echo "▸ docker compose up…"
(cd "$ROOT" && docker compose up -d)

echo "▸ Waiting for Postgres…"
until docker exec cbs-postgres pg_isready -U cbs -d cbs >/dev/null 2>&1; do sleep 1; done
echo "  ✓ ready"

echo "▸ Waiting for Redis Enterprise REST (this can take 60–90s on first start)…"
for i in $(seq 1 120); do
  code=$(CURL_RE -o /dev/null -w "%{http_code}" https://localhost:9443/v1/bootstrap 2>/dev/null || echo 000)
  if [ "$code" = "200" ] || [ "$code" = "401" ]; then
    echo "  ✓ REST up (http=$code)"
    break
  fi
  sleep 2
done

# Detect if cluster is already up (REST returns 401 = needs auth = already bootstrapped)
auth_check=$(CURL_RE -o /dev/null -w "%{http_code}" https://localhost:9443/v1/bootstrap)
if [ "$auth_check" = "401" ]; then
  echo "  cluster already bootstrapped"
else
  state=$(CURL_RE https://localhost:9443/v1/bootstrap | python3 "$HELP" bootstrap_state)
  if [ "$state" != "completed" ]; then
    echo "▸ Bootstrapping cluster (REST)…"
    payload=$(python3 "$HELP" build_create_cluster "$CLUSTER_USER" "$CLUSTER_PASS")
    CURL_RE -X POST https://localhost:9443/v1/bootstrap/create_cluster \
      -H "Content-Type: application/json" -d "$payload" >/dev/null
    for i in $(seq 1 60); do
      code=$(CURL_RE -o /dev/null -w "%{http_code}" https://localhost:9443/v1/bootstrap)
      if [ "$code" = "401" ]; then break; fi
      sleep 2
    done
    echo "  ✓ bootstrapped"
  fi
fi

echo "▸ Looking for db '$DB_NAME'…"
existing=$(CURL_RE_AUTH https://localhost:9443/v1/bdbs | python3 "$HELP" db_uid_by_name "$DB_NAME")

if [ -z "$existing" ]; then
  echo "▸ Creating db $DB_NAME on port $DB_PORT…"
  modules=$(CURL_RE_AUTH https://localhost:9443/v1/modules | python3 "$HELP" build_module_list)
  payload=$(python3 "$HELP" build_bdb_payload "$DB_NAME" "$DB_PORT" "$modules")
  CURL_RE_AUTH -X POST https://localhost:9443/v1/bdbs \
    -H "Content-Type: application/json" -d "$payload" >/dev/null
  for i in $(seq 1 60); do
    s=$(CURL_RE_AUTH https://localhost:9443/v1/bdbs | python3 "$HELP" db_status_by_name "$DB_NAME")
    if [ "$s" = "active" ]; then break; fi
    sleep 2
  done
  echo "  ✓ active"
else
  echo "  ✓ exists (uid=$existing)"
fi

echo "▸ Smoke test…"
docker run --rm --network host redis:7-alpine redis-cli -p $DB_PORT ping
docker run --rm --network host redis:7-alpine redis-cli -p $DB_PORT JSON.SET demo '$' '{"ok":true}'
docker run --rm --network host redis:7-alpine redis-cli -p $DB_PORT JSON.GET demo
docker run --rm --network host redis:7-alpine redis-cli -p $DB_PORT DEL demo

echo ""
echo "✅ Stack ready."
echo "   Redis Enterprise UI : https://localhost:8443 ($CLUSTER_USER / $CLUSTER_PASS)"
echo "   Redis DB endpoint   : redis://localhost:$DB_PORT (db: $DB_NAME)"
echo "   Postgres            : postgres://cbs:cbs@localhost:5433/cbs"
