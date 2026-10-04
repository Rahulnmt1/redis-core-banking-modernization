import { redis } from '../redisClient.js';
import { broadcast, metrics } from '../bus.js';
import { publish, STREAMS } from './streams.js';

const VEL_KEY = (cid, win) => `fraud:vel:${cid}:${win}`;
const LIMIT_KEY = (cid) => `fraud:limit:${cid}`;
const WATCHLIST_KEY = 'fraud:watchlist';
const DEDUPE_KEY = (cid) => `fraud:dedupe:${cid}`;
const RECENT_TX = (cid) => `fraud:recent:${cid}`;
const DECISIONS_LOG = 'fraud:decisions';

const WINDOWS = {
  '1m': 60,
  '1h': 3600,
  '24h': 86400,
};

const DEFAULT_LIMITS = {
  perTxn: 100000,
  daily: 500000,
  maxVelPerMin: 5,
};

export async function ensureWatchlist() {
  const exists = await redis.exists(WATCHLIST_KEY);
  if (!exists) {
    await redis.sadd(
      WATCHLIST_KEY,
      'CUST_BLOCKED01',
      'ACC9999',
      'IBAN_FRAUD_001',
      '+91-99XXXXXX99'
    );
  }
}

export async function ensureLimits(custId) {
  const exists = await redis.exists(LIMIT_KEY(custId));
  if (!exists) {
    await redis.hset(LIMIT_KEY(custId), DEFAULT_LIMITS);
  }
}

export async function getLimits(custId) {
  await ensureLimits(custId);
  const data = await redis.hgetall(LIMIT_KEY(custId));
  return {
    perTxn: Number(data.perTxn),
    daily: Number(data.daily),
    maxVelPerMin: Number(data.maxVelPerMin),
  };
}

export async function setLimits(custId, limits) {
  const map = {};
  for (const [k, v] of Object.entries(limits)) map[k] = String(v);
  await redis.hset(LIMIT_KEY(custId), map);
  return getLimits(custId);
}

export async function checkTransaction({ txnId, custId, amount, beneficiary }) {
  const trace = [];
  const tick = (cmd, fn) => {
    const t = process.hrtime.bigint();
    return Promise.resolve(fn()).then((res) => {
      trace.push({
        cmd,
        ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
      });
      return res;
    });
  };
  const start = process.hrtime.bigint();
  await ensureWatchlist();
  await ensureLimits(custId);

  const reasons = [];
  let score = 0;

  const onWatchlist = await tick(`SISMEMBER fraud:watchlist ${custId}`, () =>
    redis.sismember(WATCHLIST_KEY, custId)
  );
  const beneOnWatchlist = beneficiary
    ? await tick(`SISMEMBER fraud:watchlist ${beneficiary}`, () =>
        redis.sismember(WATCHLIST_KEY, beneficiary)
      )
    : 0;
  if (onWatchlist) {
    reasons.push('Customer on watchlist');
    score += 90;
  }
  if (beneOnWatchlist) {
    reasons.push('Beneficiary on watchlist');
    score += 80;
  }

  const dedupeMember = `${amount}:${beneficiary || 'na'}`;
  const recent = await tick(
    `ZRANGEBYSCORE fraud:dedupe:${custId} ${Date.now() - 60_000} +inf`,
    () => redis.zrangebyscore(DEDUPE_KEY(custId), Date.now() - 60_000, '+inf')
  );
  if (recent.includes(dedupeMember)) {
    reasons.push('Duplicate transaction within 60s');
    score += 70;
  }

  const counters = {};
  for (const [name, sec] of Object.entries(WINDOWS)) {
    const key = VEL_KEY(custId, name);
    const v = await tick(`INCR ${key}`, () => redis.incr(key));
    if (v === 1) {
      await tick(`EXPIRE ${key} ${sec}`, () => redis.expire(key, sec));
    }
    counters[name] = v;
  }
  const limits = await getLimits(custId);
  if (counters['1m'] > limits.maxVelPerMin) {
    reasons.push(`Velocity exceeded: ${counters['1m']} txns / 1m`);
    score += 60;
  }

  if (amount > limits.perTxn) {
    reasons.push(`Amount ${amount} exceeds per-txn limit ${limits.perTxn}`);
    score += 40;
  }

  const dailyKey = `fraud:daily:${custId}:${new Date().toISOString().slice(0, 10)}`;
  const dailyTotal =
    (await tick(`INCRBY ${dailyKey} ${Number(amount)}`, () =>
      redis.incrby(dailyKey, Number(amount))
    )) || 0;
  await tick(`EXPIRE ${dailyKey} 90000`, () => redis.expire(dailyKey, 90000));
  if (dailyTotal > limits.daily) {
    reasons.push(`Daily total ${dailyTotal} exceeds limit ${limits.daily}`);
    score += 50;
  }

  await tick(`ZADD fraud:dedupe:${custId} ${Date.now()} ${dedupeMember}`, () =>
    redis.zadd(DEDUPE_KEY(custId), Date.now(), dedupeMember)
  );
  await tick(`EXPIRE fraud:dedupe:${custId} 120`, () =>
    redis.expire(DEDUPE_KEY(custId), 120)
  );

  await tick(`LPUSH fraud:recent:${custId} {txn=${txnId} amount=${amount} score=${score}}`, () =>
    redis.lpush(
      RECENT_TX(custId),
      JSON.stringify({ txnId, amount, beneficiary, ts: Date.now(), score })
    )
  );
  await tick(`LTRIM fraud:recent:${custId} 0 9`, () =>
    redis.ltrim(RECENT_TX(custId), 0, 9)
  );
  await tick(`EXPIRE fraud:recent:${custId} 600`, () =>
    redis.expire(RECENT_TX(custId), 600)
  );

  const decision = score >= 80 ? 'BLOCK' : score >= 40 ? 'REVIEW' : 'APPROVE';

  await tick(
    `XADD fraud:decisions MAXLEN ~ 500 * txnId ${txnId} custId ${custId} amount ${amount} score ${score} decision ${decision}`,
    () =>
      redis.xadd(
        DECISIONS_LOG,
        'MAXLEN',
        '~',
        '500',
        '*',
        'txnId',
        txnId,
        'custId',
        custId,
        'amount',
        String(amount),
        'beneficiary',
        String(beneficiary || ''),
        'score',
        String(score),
        'decision',
        decision,
        'reasons',
        reasons.join('|')
      )
  );
  metrics.inc('fraudDecisions');

  if (decision === 'APPROVE') {
    await publish(STREAMS.CBS_TXN, {
      eventType: 'fraud.approved',
      txnId,
      custId,
      amount,
      beneficiary: beneficiary || '',
      ts: Date.now(),
    });
  }

  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
  const out = {
    txnId,
    custId,
    decision,
    score,
    reasons,
    counters,
    dailyTotal,
    limits,
    latencyMs: Number(ms.toFixed(3)),
    trace,
  };
  broadcast('uc6:decision', out);
  return out;
}

export async function listRecentDecisions(count = 20) {
  const entries = await redis.xrevrange(DECISIONS_LOG, '+', '-', 'COUNT', count);
  return entries.map(([id, fields]) => {
    const obj = { id };
    for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
    return obj;
  });
}

export async function fraudState(custId) {
  await ensureLimits(custId);
  const limits = await getLimits(custId);
  const counters = {};
  for (const [name] of Object.entries(WINDOWS)) {
    counters[name] = Number((await redis.get(VEL_KEY(custId, name))) || 0);
  }
  const watchlist = await redis.smembers(WATCHLIST_KEY);
  const recent = (await redis.lrange(RECENT_TX(custId), 0, 9)).map((s) => JSON.parse(s));
  return { custId, limits, counters, watchlist, recent };
}

export async function addToWatchlist(member) {
  await redis.sadd(WATCHLIST_KEY, member);
  return { added: member };
}
export async function removeFromWatchlist(member) {
  await redis.srem(WATCHLIST_KEY, member);
  return { removed: member };
}
