import { pgPool } from '../pgClient.js';
import { redis } from '../redisClient.js';
import { nanoid } from 'nanoid';

async function timeIt(fn) {
  const start = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function summarize(samples) {
  if (samples.length === 0) return { avg: 0, p50: 0, p95: 0, min: 0, max: 0, samples };
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    avg: round(avg),
    p50: round(p(0.5)),
    p95: round(p(0.95)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    samples: samples.map(round),
  };
}

const round = (v) => Number(v.toFixed(3));

async function runBoth({ iterations, pgFn, redisFn, pgWarmup = 1, redisWarmup = 5 }) {
  for (let i = 0; i < pgWarmup; i++) await pgFn(i);
  for (let i = 0; i < redisWarmup; i++) await redisFn(i);

  const pgSamples = [];
  for (let i = 0; i < iterations; i++) pgSamples.push(await timeIt(() => pgFn(i)));
  const redisSamples = [];
  for (let i = 0; i < iterations; i++) redisSamples.push(await timeIt(() => redisFn(i)));

  const pg = summarize(pgSamples);
  const re = summarize(redisSamples);
  const ratio = pg.avg / Math.max(re.avg, 0.001);

  return {
    iterations,
    postgres: pg,
    redis: re,
    speedup: Number(ratio.toFixed(1)),
    advantage:
      ratio >= 2
        ? `Redis is ${ratio.toFixed(1)}× faster`
        : ratio <= 0.5
          ? `Postgres is ${(1 / ratio).toFixed(1)}× faster`
          : 'comparable',
  };
}

export const benchmarks = {
  async uc1(custId = 'CUST000001', iterations = 25) {
    return runBoth({
      iterations,
      pgFn: async () => {
        await pgPool.query('SELECT * FROM customers WHERE cust_id = $1', [custId]);
        await pgPool.query('SELECT * FROM accounts WHERE cust_id = $1', [custId]);
        await pgPool.query('SELECT * FROM loans WHERE cust_id = $1', [custId]);
        await pgPool.query('SELECT * FROM cards WHERE cust_id = $1', [custId]);
        await pgPool.query(
          `SELECT t.* FROM transactions t JOIN accounts a ON a.acct_id=t.acct_id
           WHERE a.cust_id = $1 ORDER BY t.ts DESC LIMIT 5`,
          [custId]
        );
      },
      redisFn: async () => {
        await redis.call('JSON.GET', `cust360:${custId}`, '$');
      },
    });
  },

  async uc2(iterations = 25) {
    const sid = 'bench-' + nanoid(8);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS bench_sessions (
        session_id text PRIMARY KEY,
        cust_id text, channel text, device text,
        mfa_state text, risk_score int,
        last_seen_at timestamptz, expires_at timestamptz
      )
    `);
    await pgPool.query(
      `INSERT INTO bench_sessions VALUES ($1,'CUST00001','MOBILE','iPhone','PASSED',12,now(),now()+interval '5 minutes')
       ON CONFLICT (session_id) DO UPDATE SET last_seen_at=now()`,
      [sid]
    );
    await redis.hset(`session:${sid}`, {
      sessionId: sid,
      custId: 'CUST00001',
      channel: 'MOBILE',
      device: 'iPhone',
      mfaState: 'PASSED',
      riskScore: '12',
    });
    await redis.expire(`session:${sid}`, 300);

    const result = await runBoth({
      iterations,
      pgFn: async () => {
        await pgPool.query('SELECT * FROM bench_sessions WHERE session_id = $1', [sid]);
      },
      redisFn: async () => {
        await redis.hgetall(`session:${sid}`);
      },
    });

    await pgPool.query('DELETE FROM bench_sessions WHERE session_id = $1', [sid]);
    await redis.del(`session:${sid}`);
    return result;
  },

  async uc3(iterations = 25) {
    const token = 'bench_' + nanoid(12);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS bench_tokens (
        token text PRIMARY KEY,
        partner_id text, cust_id text, scope text,
        consent_id text, expires_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS bench_rate_counters (
        partner_id text, window_id text, count int,
        PRIMARY KEY (partner_id, window_id)
      );
    `);
    await pgPool.query(
      `INSERT INTO bench_tokens VALUES ($1,'partner-1','CUST00001','accounts.read','c1', now()+interval '3 minutes')
       ON CONFLICT (token) DO NOTHING`,
      [token]
    );
    await redis.hset(`oauth:access:${token}`, {
      partnerId: 'partner-1',
      custId: 'CUST00001',
      scope: 'accounts.read',
      consentId: 'c1',
    });
    await redis.expire(`oauth:access:${token}`, 180);

    const result = await runBoth({
      iterations,
      pgFn: async () => {
        await pgPool.query('SELECT * FROM bench_tokens WHERE token=$1 AND expires_at>now()', [token]);
        await pgPool.query(
          `INSERT INTO bench_rate_counters (partner_id, window_id, count)
           VALUES ('partner-1', $1, 1)
           ON CONFLICT (partner_id, window_id) DO UPDATE SET count = bench_rate_counters.count + 1
           RETURNING count`,
          [String(Math.floor(Date.now() / 60000))]
        );
      },
      redisFn: async () => {
        await redis.hgetall(`oauth:access:${token}`);
        await redis.incr(`bench:rl:partner-1:${Math.floor(Date.now() / 60000)}`);
      },
    });

    await pgPool.query('DELETE FROM bench_tokens WHERE token = $1', [token]);
    await redis.del(`oauth:access:${token}`);
    return result;
  },

  async uc4(iterations = 25) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS bench_events (
        id bigserial PRIMARY KEY, ts timestamptz DEFAULT now(),
        event_type text, payload jsonb
      );
      CREATE TABLE IF NOT EXISTS bench_consumers (
        group_name text PRIMARY KEY, last_id bigint
      );
    `);
    let lastId = 0;
    return runBoth({
      iterations,
      pgFn: async () => {
        await pgPool.query(
          `INSERT INTO bench_events (event_type, payload)
           VALUES ('transaction.posted', '{"x":1}')`
        );
        const r = await pgPool.query(
          `SELECT id, ts, event_type, payload FROM bench_events
           WHERE id > $1 ORDER BY id LIMIT 1`,
          [lastId]
        );
        if (r.rows.length) lastId = r.rows[0].id;
      },
      redisFn: async () => {
        const id = await redis.xadd(
          'bench:stream',
          'MAXLEN',
          '~',
          '500',
          '*',
          'eventType',
          'transaction.posted',
          'payload',
          '{"x":1}'
        );
        await redis.xrange('bench:stream', id, id);
      },
    });
  },

  async uc5(acctId = 'ACC1001', iterations = 25) {
    return runBoth({
      iterations,
      pgFn: async () => {
        await pgPool.query(
          `SELECT a.*, t.txn_id AS last_txn_id, t.type AS last_type, t.amount AS last_amount
           FROM accounts a
           LEFT JOIN LATERAL (SELECT * FROM transactions WHERE acct_id=a.acct_id ORDER BY ts DESC LIMIT 1) t ON true
           WHERE a.acct_id=$1`,
          [acctId]
        );
      },
      redisFn: async () => {
        await redis.call('JSON.GET', `readmodel:account:${acctId}`, '$');
      },
    });
  },

  async uc6(iterations = 25) {
    const cust = 'CUST00001';
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS bench_velocity (
        cust_id text, window_id text, count int,
        PRIMARY KEY (cust_id, window_id)
      );
      CREATE TABLE IF NOT EXISTS bench_watchlist (member text PRIMARY KEY);
      INSERT INTO bench_watchlist (member) VALUES ('BAD-CUST') ON CONFLICT DO NOTHING;
    `);
    return runBoth({
      iterations,
      pgFn: async () => {
        await pgPool.query(
          `INSERT INTO bench_velocity VALUES ($1, $2, 1)
           ON CONFLICT (cust_id,window_id) DO UPDATE SET count=bench_velocity.count+1 RETURNING count`,
          [cust, String(Math.floor(Date.now() / 60000))]
        );
        await pgPool.query('SELECT 1 FROM bench_watchlist WHERE member=$1', [cust]);
      },
      redisFn: async () => {
        await redis.incr(`bench:fraud:vel:${cust}:${Math.floor(Date.now() / 60000)}`);
        await redis.sismember('bench:fraud:watchlist', cust);
      },
    });
  },

  async uc7(iterations = 25) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS bench_switch_txns (
        ref_id text PRIMARY KEY, amount numeric, ts timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS bench_cbs_txns (
        ref_id text PRIMARY KEY, amount numeric, ts timestamptz DEFAULT now()
      );
    `);
    let i = 0;
    return runBoth({
      iterations,
      pgFn: async () => {
        const ref = 'r' + i++ + '-' + Date.now();
        await pgPool.query('INSERT INTO bench_switch_txns (ref_id, amount) VALUES ($1, 100)', [ref]);
        await pgPool.query('INSERT INTO bench_cbs_txns (ref_id, amount) VALUES ($1, 100)', [ref]);
        await pgPool.query(
          `SELECT s.ref_id FROM bench_switch_txns s
           JOIN bench_cbs_txns c ON c.ref_id = s.ref_id AND c.amount = s.amount
           WHERE s.ref_id = $1`,
          [ref]
        );
      },
      redisFn: async () => {
        const ref = 'r' + i++ + '-' + Date.now();
        await redis.hset(`bench:rs:${ref}`, { amount: 100 });
        await redis.hset(`bench:rc:${ref}`, { amount: 100 });
        const a = await redis.hget(`bench:rs:${ref}`, 'amount');
        const b = await redis.hget(`bench:rc:${ref}`, 'amount');
        if (a === b) await redis.del(`bench:rs:${ref}`, `bench:rc:${ref}`);
      },
    });
  },
};
