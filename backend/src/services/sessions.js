import { redis } from '../redisClient.js';
import { nanoid } from 'nanoid';
import { broadcast, metrics } from '../bus.js';

const SESSION_TTL = 300;
const SESSION_KEY = (id) => `session:${id}`;
const SESSIONS_BY_CUST = (cid) => `sessions:byCust:${cid}`;

function nowMsHr() {
  return process.hrtime.bigint();
}
function elapsedMs(start) {
  return Number((process.hrtime.bigint() - start)) / 1e6;
}

export async function createSession({ custId, channel, device, mfa = false }) {
  const id = nanoid(12);
  const now = Date.now();
  const fields = {
    sessionId: id,
    custId,
    channel,
    device: device || 'unknown',
    mfaState: mfa ? 'PASSED' : 'PENDING',
    riskScore: '12',
    consentVersion: 'v3.1',
    createdAt: String(now),
    lastSeenAt: String(now),
  };
  const trace = [];
  let t = nowMsHr();
  await redis.hset(SESSION_KEY(id), fields);
  trace.push({
    cmd: `HSET session:${id} sessionId ${id} custId ${custId} channel ${channel} device ${fields.device} mfaState ${fields.mfaState} riskScore 12 consentVersion v3.1`,
    ms: Number(elapsedMs(t).toFixed(3)),
  });
  t = nowMsHr();
  await redis.expire(SESSION_KEY(id), SESSION_TTL);
  trace.push({ cmd: `EXPIRE session:${id} ${SESSION_TTL}`, ms: Number(elapsedMs(t).toFixed(3)) });
  t = nowMsHr();
  await redis.sadd(SESSIONS_BY_CUST(custId), id);
  trace.push({
    cmd: `SADD sessions:byCust:${custId} ${id}`,
    ms: Number(elapsedMs(t).toFixed(3)),
  });
  t = nowMsHr();
  await redis.expire(SESSIONS_BY_CUST(custId), SESSION_TTL * 2);
  trace.push({
    cmd: `EXPIRE sessions:byCust:${custId} ${SESSION_TTL * 2}`,
    ms: Number(elapsedMs(t).toFixed(3)),
  });
  metrics.inc('redisWrites');
  broadcast('uc2:session', { action: 'created', id, custId, channel });
  return {
    id,
    ttl: SESSION_TTL,
    fields,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    output: { sessionId: id, ...fields, ttl: SESSION_TTL },
  };
}

export async function listAllSessions() {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'session:*', 'COUNT', 100);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  const out = [];
  for (const k of keys) {
    const data = await redis.hgetall(k);
    const ttl = await redis.ttl(k);
    if (Object.keys(data).length === 0) continue;
    out.push({ key: k, ttl, ...data });
  }
  return out.sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0));
}

export async function readSession(id) {
  const trace = [];
  const start = nowMsHr();
  let t = nowMsHr();
  const data = await redis.hgetall(SESSION_KEY(id));
  trace.push({ cmd: `HGETALL session:${id}`, ms: Number(elapsedMs(t).toFixed(3)) });
  t = nowMsHr();
  const ttl = await redis.ttl(SESSION_KEY(id));
  trace.push({ cmd: `TTL session:${id}`, ms: Number(elapsedMs(t).toFixed(3)) });
  if (Object.keys(data).length === 0) {
    return { id, found: false, trace, totalLatencyMs: Number(elapsedMs(start).toFixed(3)) };
  }
  return {
    id,
    found: true,
    trace,
    totalLatencyMs: Number(elapsedMs(start).toFixed(3)),
    output: { ttl, ...data },
  };
}

export async function touchSession(id) {
  const key = SESSION_KEY(id);
  const exists = await redis.exists(key);
  if (!exists) return null;
  const trace = [];
  let t = nowMsHr();
  await redis.hset(key, 'lastSeenAt', String(Date.now()));
  trace.push({ cmd: `HSET session:${id} lastSeenAt ${Date.now()}`, ms: Number(elapsedMs(t).toFixed(3)) });
  t = nowMsHr();
  await redis.expire(key, SESSION_TTL);
  trace.push({ cmd: `EXPIRE session:${id} ${SESSION_TTL}`, ms: Number(elapsedMs(t).toFixed(3)) });
  metrics.inc('redisWrites');
  broadcast('uc2:session', { action: 'touched', id });
  return {
    id,
    ttl: SESSION_TTL,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    output: { id, ttl: SESSION_TTL, action: 'touched' },
  };
}

export async function completeMFA(id) {
  const key = SESSION_KEY(id);
  const exists = await redis.exists(key);
  if (!exists) return null;
  const trace = [];
  let t = nowMsHr();
  await redis.hset(key, { mfaState: 'PASSED', riskScore: '4' });
  trace.push({ cmd: `HSET session:${id} mfaState PASSED riskScore 4`, ms: Number(elapsedMs(t).toFixed(3)) });
  t = nowMsHr();
  await redis.expire(key, SESSION_TTL);
  trace.push({ cmd: `EXPIRE session:${id} ${SESSION_TTL}`, ms: Number(elapsedMs(t).toFixed(3)) });
  metrics.inc('redisWrites');
  broadcast('uc2:session', { action: 'mfa', id });
  return {
    id,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    output: { id, mfaState: 'PASSED', riskScore: 4 },
  };
}

export async function revokeSession(id) {
  const key = SESSION_KEY(id);
  const trace = [];
  let t = nowMsHr();
  const data = await redis.hgetall(key);
  trace.push({ cmd: `HGETALL session:${id}`, ms: Number(elapsedMs(t).toFixed(3)) });
  if (data.custId) {
    t = nowMsHr();
    await redis.srem(SESSIONS_BY_CUST(data.custId), id);
    trace.push({
      cmd: `SREM sessions:byCust:${data.custId} ${id}`,
      ms: Number(elapsedMs(t).toFixed(3)),
    });
  }
  t = nowMsHr();
  await redis.del(key);
  trace.push({ cmd: `DEL session:${id}`, ms: Number(elapsedMs(t).toFixed(3)) });
  metrics.inc('redisWrites');
  broadcast('uc2:session', { action: 'revoked', id });
  return {
    id,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    output: { id, revoked: true },
  };
}
