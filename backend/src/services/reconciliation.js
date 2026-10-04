import { redis } from '../redisClient.js';
import { broadcast, metrics } from '../bus.js';
import { publish, STREAMS } from './streams.js';
import { nanoid } from 'nanoid';

const PENDING_SWITCH = 'recon:pending:switch';
const PENDING_CBS = 'recon:pending:cbs';
const MATCHED = 'recon:matched';
const EXCEPTIONS = 'recon:exceptions';
const STATS_KEY = 'recon:stats';

export async function emitSwitchTxn({ amount, beneficiary, channel = 'UPI' } = {}) {
  const txnId = 'PSW' + nanoid(8);
  const refId = 'REF' + nanoid(10);
  const amt = amount ?? Math.round((Math.random() * 10000 + 50) * 100) / 100;
  const ts = Date.now();
  const fields = {
    txnId,
    refId,
    amount: amt,
    beneficiary: beneficiary || 'BENE-' + Math.floor(Math.random() * 999),
    channel,
    side: 'switch',
    ts,
  };
  const trace = [];
  let t = process.hrtime.bigint();
  await publish(STREAMS.PAYMENTS, fields);
  trace.push({
    cmd: `XADD stream:payments.switch * txnId ${txnId} refId ${refId} amount ${amt} side switch`,
    ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
  });
  t = process.hrtime.bigint();
  await redis.hset(`${PENDING_SWITCH}:${refId}`, fields);
  trace.push({
    cmd: `HSET recon:pending:switch:${refId} txnId ${txnId} refId ${refId} amount ${amt} side switch`,
    ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
  });
  t = process.hrtime.bigint();
  await redis.expire(`${PENDING_SWITCH}:${refId}`, 600);
  trace.push({
    cmd: `EXPIRE recon:pending:switch:${refId} 600`,
    ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
  });
  t = process.hrtime.bigint();
  await redis.zadd(PENDING_SWITCH, ts, refId);
  trace.push({
    cmd: `ZADD recon:pending:switch ${ts} ${refId}`,
    ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
  });
  metrics.inc('redisWrites');
  setTimeout(() => emitMatchingCbs(refId, fields).catch(() => {}), 200 + Math.random() * 600);
  return {
    ...fields,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
  };
}

async function emitMatchingCbs(refId, switchFields) {
  if (Math.random() < 0.15) {
    broadcast('uc7:exception', {
      kind: 'no_cbs_record',
      refId,
      switch: switchFields,
      ts: Date.now(),
    });
    return;
  }
  const drift = Math.random() < 0.1;
  const amount = drift ? switchFields.amount + 1 : switchFields.amount;
  const txnId = 'CBS' + nanoid(8);
  const fields = {
    txnId,
    refId,
    amount,
    beneficiary: switchFields.beneficiary,
    channel: switchFields.channel,
    side: 'cbs',
    ts: Date.now(),
  };
  await publish(STREAMS.CBS_TXN, fields);
  await redis.hset(`${PENDING_CBS}:${refId}`, fields);
  await redis.expire(`${PENDING_CBS}:${refId}`, 600);
  await redis.zadd(PENDING_CBS, fields.ts, refId);
  await tryMatch(refId);
}

export async function tryMatch(refId) {
  const sw = await redis.hgetall(`${PENDING_SWITCH}:${refId}`);
  const c = await redis.hgetall(`${PENDING_CBS}:${refId}`);
  if (!sw.refId || !c.refId) return null;
  if (Number(sw.amount) === Number(c.amount)) {
    await redis.hincrby(STATS_KEY, 'matched', 1);
    metrics.inc('reconMatched');
    await redis.zadd(MATCHED, Date.now(), refId);
    await redis.zremrangebyrank(MATCHED, 0, -101);
    await redis.del(`${PENDING_SWITCH}:${refId}`, `${PENDING_CBS}:${refId}`);
    await redis.zrem(PENDING_SWITCH, refId);
    await redis.zrem(PENDING_CBS, refId);
    broadcast('uc7:matched', { refId, amount: Number(sw.amount), ts: Date.now() });
    return { matched: true, refId };
  }
  await redis.hincrby(STATS_KEY, 'exceptions', 1);
  metrics.inc('reconExceptions');
  await redis.xadd(
    EXCEPTIONS,
    'MAXLEN',
    '~',
    '200',
    '*',
    'refId',
    refId,
    'switchAmount',
    sw.amount,
    'cbsAmount',
    c.amount,
    'ts',
    String(Date.now())
  );
  await redis.del(`${PENDING_SWITCH}:${refId}`, `${PENDING_CBS}:${refId}`);
  await redis.zrem(PENDING_SWITCH, refId);
  await redis.zrem(PENDING_CBS, refId);
  broadcast('uc7:exception', {
    kind: 'amount_mismatch',
    refId,
    switchAmount: Number(sw.amount),
    cbsAmount: Number(c.amount),
    ts: Date.now(),
  });
  return { matched: false, refId };
}

export async function reconStats() {
  const stats = await redis.hgetall(STATS_KEY);
  const pendingSwitch = await redis.zcard(PENDING_SWITCH);
  const pendingCBS = await redis.zcard(PENDING_CBS);
  const recentExceptions = await redis.xrevrange(EXCEPTIONS, '+', '-', 'COUNT', 10);
  return {
    matched: Number(stats.matched || 0),
    exceptions: Number(stats.exceptions || 0),
    pendingSwitch,
    pendingCBS,
    recentExceptions: recentExceptions.map(([id, f]) => {
      const obj = { id };
      for (let i = 0; i < f.length; i += 2) obj[f[i]] = f[i + 1];
      return obj;
    }),
  };
}
