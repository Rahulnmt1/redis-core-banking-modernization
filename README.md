# Redis Enterprise · Core Banking Modernization Demo

A polished, single-screen demo that visualizes **use cases 1–7** from the
"Redis Enterprise for Core Banking modernization" whitepaper, running on a
realistic stack:

- **Postgres 16** as the system-of-record (stand-in for Oracle / TCS BaNCS),
  pre-seeded with **50 000 customers, ~100 000 accounts, 200 000 transactions,
  10 000 loans and 25 000 cards** (~385 k rows) on first boot
- **Redis Enterprise** (`redislabs/redis:latest`, official image) as the
  real-time data layer with **JSON + Search** modules
- A live **RDI-style CDC pipeline** (Postgres `LISTEN/NOTIFY` → Node engine →
  Redis JSON / Streams) that mirrors how Redis Data Integration works
- An Express API + React UI, with Server-Sent Events for live updates

Every action you take in the dashboard surfaces a **Query trace** card showing
the literal Redis / SQL commands that ran, the JSON output they returned, and
their server-measured latency in milliseconds.

| # | Use case | What you see |
|---|---|---|
| 1 | Customer 360 / account aggregation | 5 SELECTs vs 1 JSON.GET, side-by-side; rich 360 view; FT.SEARCH |
| 2 | Omnichannel session, profile, auth | HSET / EXPIRE on login, HGETALL on read, TTL bars |
| 3 | Open banking, partner APIs, tokens | Token issue trace, INCR rate-limit gauge, consent revoke |
| 4 | Event-driven integration hub | XADD / XREVRANGE / XREADGROUP traces, consumer groups |
| 5 | CBS modernization with CQRS | Postgres BEGIN/UPDATE/INSERT/COMMIT trace; JSON.GET vs JOIN |
| 6 | Real-time fraud, limits, dedupe | Per-decision SISMEMBER / INCR / ZADD / XADD trace |
| 7 | Near-real-time reconciliation | Switch leg XADD + HSET + EXPIRE + ZADD trace |

## Architecture

```
┌──────────┐   pg_notify   ┌──────────────┐   JSON.SET / XADD   ┌─────────────────────────┐
│ Postgres │ ─────────────► │ RDI engine   │ ───────────────────► │ Redis Enterprise        │
│ (CBS)    │   triggers     │ (LISTEN loop)│                      │ JSON · Search · Streams │
│ port 5433│                │ in Node      │                      │ port 12000              │
└──────────┘                └──────────────┘                      └─────────────────────────┘
      ▲                                                                       │
      │ command writes                                                        │ JSON.GET / FT.SEARCH
      │                                                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Express backend (REST + SSE) · http://localhost:4000                              │
└──────────────────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │ /api/* + SSE
                                       │
                                  ┌────┴─────┐
                                  │ React UI │  http://localhost:5173
                                  └──────────┘
```

The CDC pipeline is functionally what RDI does: capture row-level changes
(insert / update / delete) from the source DB and apply them to Redis as JSON
read-models or as Stream events. We use Postgres triggers + `pg_notify` because
the demo runs in a single Postgres instance; production RDI uses Debezium
against the Postgres / Oracle WAL.

## Prerequisites

- **Docker Desktop** with Compose (we use the official `postgres:16-alpine` and
  `redislabs/redis:latest` images)
- **Node 18+** (tested on 25)
- macOS / Linux. The Redis Enterprise image is amd64; on Apple Silicon it runs
  via Rosetta — slow to start the very first time (~60–90 s), fine to run.

## Quick start (scripted)

The recommended way to drive the demo is the `demo.sh` controller. Each
sub-command waits for proper health checks (Postgres `pg_isready`, Redis
Enterprise REST `200/401`, cache `PING → PONG`, backend `/api/health`, Vite
`200 OK`) before returning, so it is safe to chain.

```bash
./demo.sh up           # bring everything up — containers + backend + frontend
./demo.sh status       # health-check all four layers (containers/cache/api/ui)
./demo.sh restart      # full graceful restart
./demo.sh down         # stop everything (volumes + data preserved)
./demo.sh reset        # ⚠ wipes Postgres + Redis volumes, then up clean
./demo.sh logs <layer> # tail logs (backend|frontend|postgres|redis)
```

A typical first run takes **~25 s on a warm boot**, ~90 s on a cold first boot
(Redis Enterprise takes a minute to cluster on Apple Silicon under Rosetta).

### Per-layer control

```bash
./demo.sh containers up|down|restart|status    # just Postgres + Redis Enterprise
./demo.sh backend    start|stop|restart|status # just the Node API
./demo.sh frontend   start|stop|restart|status # just the Vite dev server
```

PID files and logs live under `./.run/`:

```
.run/backend.pid    .run/backend.log
.run/frontend.pid   .run/frontend.log
.run/setup.log      # output of infra/setup.sh
```

### Convenience wrappers

For muscle memory the following one-liners delegate to `demo.sh`:

```bash
./start.sh    # → ./demo.sh up
./stop.sh     # → ./demo.sh down
./status.sh   # → ./demo.sh status
```

Open **http://localhost:5173** when `up` finishes.

## Manual start (without the script)

Useful when you want each layer in its own terminal, or you are debugging the
script itself.

### 1 · Bring up the containers (Postgres + Redis Enterprise)

```bash
# from repo root
docker compose up -d                      # start in background

# bootstrap the Redis Enterprise cluster + cbs-cache database
# (idempotent — safe to re-run; ~60–90 s on first boot, ~3 s on subsequent runs)
bash infra/setup.sh
```

You should see `✅ Stack ready.` Verify:

```bash
docker ps                                 # both cbs-postgres and cbs-redis-enterprise = (healthy)
docker exec cbs-postgres pg_isready -U cbs -d cbs                       # → accepting connections
docker run --rm --network host redis:7-alpine redis-cli -p 12000 ping   # → PONG
```

### 2 · Start the backend (terminal 2)

```bash
cd backend
npm install                               # first time only
npm start                                 # http://localhost:4000
```

On first boot the backend runs `initSchema` which creates the tables, triggers,
and seeds **50 000 customers / 200 000 transactions** (~3.4 s). On subsequent
boots it detects that the row count already matches `SCALE.customers` and
skips re-seeding.

```bash
curl http://localhost:4000/api/health     # → {"ok":true,"redis":"PONG","postgres":true}
curl http://localhost:4000/api/customers/stats
# → {"customers":50000,"accounts":99971,"transactions":200000,"loans":10000,"cards":25000,…}
```

### 3 · Start the frontend (terminal 3)

```bash
cd frontend
npm install                               # first time only
npm run dev                               # http://localhost:5173
```

## Stop the demo (manual equivalents)

### Stop everything (graceful)

```bash
pkill -f 'vite'                           # frontend
pkill -f 'node src/server.js'             # backend
docker compose stop                       # containers (volumes preserved)
```

Re-running `docker compose up -d` brings everything back in a few seconds —
Postgres data, Redis Enterprise cluster, and the cbs-cache database are all
preserved on the named volumes. (Or just run `./demo.sh up`, which does this
plus health-checks each layer before returning.)

### Restart everything from a clean slate (wipes data)

```bash
./demo.sh reset                           # interactive — asks for confirmation

# or manually:
pkill -f 'vite' ; pkill -f 'node src/server.js'
docker compose down -v                    # ⚠ removes Postgres + RE volumes
./demo.sh up                              # re-bootstraps RE, re-seeds 50 k customers
```

### Just restart the containers (preserve data)

```bash
./demo.sh containers restart              # ~25 s, with health checks

# or manually:
docker compose restart                    # ~5 s, no health checks
```

The backend will reconnect automatically as long as it was started after the
containers came back up. If you restarted containers while the backend was
running, run `./demo.sh backend restart` too.

## Endpoints & credentials

| Service | URL / port | Credentials |
|---|---|---|
| Dashboard | http://localhost:5173 | — |
| API | http://localhost:4000 | — |
| Redis Enterprise UI | https://localhost:8443 | `demo@redis.com` / `Redis123!` |
| Redis CLI | `redis-cli -p 12000` (db: `cbs-cache`) | — |
| Postgres | `psql postgres://cbs:cbs@127.0.0.1:5433/cbs` | `cbs` / `cbs` |

## Suggested 5-minute demo flow

Each panel follows the same pattern: **Section header (with business
outcomes) → Demo guide (steps + expected results) → Architecture diagram →
Interactive controls → Query trace card** showing the actual commands that
ran with their server-measured latency.

1. **UC1 Customer 360**
   - Pick a customer (or search "Sharma" / "Mumbai" / "Wealth")
   - Toggle the source between Redis (1 JSON.GET, ~1 ms) and Postgres
     (5 SELECTs, ~10–15 ms) in the 360 view
   - Scroll to **Query trace** to see the literal SQL vs `JSON.GET`
   - Click any of the example chips in the search card to see FT.SEARCH hits
     and the index definition
2. **UC2 Sessions** — pick a customer, click Mobile / Web / ATM. Watch the
   session row appear with a 5-min TTL bar. Click the eye icon → see HGETALL
   + TTL trace. Click MFA → state flips PENDING → PASSED.
3. **UC3 Open Banking** — issue a token (6-command HSET+EXPIRE trace), click
   Single call (3-command trace), click *Burst 35* → rate-limit kicks in
   (calls denied with `rate_limited`).
4. **UC4 Event Hub** — click each producer → `XADD` trace appears in the
   Query trace. Click on a stream tile → `XREVRANGE` trace updates. Click
   *Consume* on a group → `XREADGROUP` + `XACK`.
5. **UC5 CQRS** — pick an account, post a transaction. Query trace shows the
   PG `BEGIN/UPDATE/INSERT/COMMIT`; the Redis read-model panel updates
   ~10–30 ms later (RDI-lag pill turns green).
6. **UC6 Fraud** — submit a normal txn → APPROVE (~12 Redis commands traced).
   Click *Burst x 8* → velocity rule kicks in, decision flips to REVIEW /
   BLOCK. Add `BAD-CUST` to the watchlist → SISMEMBER returns 1, decision is
   BLOCK with reason `Customer on watchlist`.
7. **UC7 Reconciliation** — click *Emit 1* → 4-command trace (XADD +
   HSET + EXPIRE + ZADD). Click *Burst 100* → match-rate gauge climbs,
   live exceptions appear for amount-mismatch and missing-CBS-leg.

## Data scale

The seed scale is configurable in `backend/src/data/dataGen.js`:

```js
export const SCALE = {
  customers: 50_000,
  accountsPerCustomerMin: 1,
  accountsPerCustomerMax: 3,
  loans: 10_000,
  cards: 25_000,
  transactions: 200_000,
};
```

Change any value and restart the backend — it detects a mismatch with the
current Postgres row count and reseeds (`TRUNCATE … CASCADE` + batched
`INSERT`s with `session_replication_role = replica`). The 50 k / 200 k load
takes ~3.4 s on a modern laptop.

> **Heads-up about cust360 hydration.** On boot the backend pre-hydrates the
> first 250 `cust360:*` JSON documents into Redis. The remaining ones hydrate
> on demand: every Postgres write triggers RDI to refresh the affected
> customer document, and the UC1 *Customer picker* has a **Sync 1k** button
> that batch-rebuilds an additional 1 000 docs at a time. To pre-warm the
> entire base in one go:
>
> ```bash
> curl -X POST 'http://localhost:4000/api/rdi/resync?max=50000'
> ```

## Files

```
Redis-for-CBS/
├── docker-compose.yml              Postgres + Redis Enterprise
├── demo.sh                         lifecycle controller (up/down/restart/status/reset/logs)
├── start.sh / stop.sh / status.sh  thin wrappers → demo.sh
├── .run/                           PID + log files (created by demo.sh, gitignored)
├── infra/
│   ├── setup.sh                    bootstrap RE + create cbs-cache db
│   └── _re_helpers.py              REST API helpers
├── backend/
│   └── src/
│       ├── server.js               Express + SSE + global error handlers
│       ├── pgClient.js / pgSchema  Postgres pool + schema + bulk seeder
│       ├── redisClient.js          ioredis to Redis Enterprise on :12000
│       ├── rdi.js                  RDI engine: PG LISTEN → Redis writes
│       ├── bus.js                  SSE broadcaster + metrics
│       ├── data/dataGen.js         deterministic mock CBS data + SCALE
│       └── services/
│           ├── customer360.js      UC1 · JSON + FT.SEARCH + sanitize
│           ├── sessions.js         UC2 · Hash + TTL with command tracing
│           ├── openBanking.js      UC3 · tokens + INCR rate limit + traces
│           ├── streams.js          UC4 · Streams + groups + XADD/XREAD traces
│           ├── cqrs.js             UC5 · Postgres command + JSON.GET read-model
│           ├── fraud.js            UC6 · velocity, limits, watchlist, decision log
│           ├── reconciliation.js   UC7 · 2-stream matcher with traces
│           ├── inspector.js        live key-space browser
│           └── benchmarks.js       PG vs Redis benchmark suite (still wired)
├── frontend/
│   └── src/
│       ├── App.jsx                 shell + sidebar
│       ├── panels/UC1–UC7.jsx      one panel per use case
│       └── components/
│           ├── ui.jsx              design primitives (Card, Pill, Stat …)
│           ├── DemoGuide.jsx       in-panel "what to run, what happens"
│           ├── CustomerPicker.jsx  searchable / paginated customer list
│           ├── Customer360View.jsx rich UC1 360 view + source toggle
│           └── QueryTrace.jsx      reusable Query / Command trace cards
└── README.md
```

## Brand

UI follows Redis brand guidelines from [brand.redis.io](https://brand.redis.io/):
Hyper red `#FF4438` on Midnight `#091A23` / `#050D14`, Space Grotesk for
display, Inter for body, Space Mono for code.
