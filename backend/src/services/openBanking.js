import { redis } from '../redisClient.js';
import { nanoid } from 'nanoid';
import { broadcast, metrics } from '../bus.js';

const TOKEN_TTL = 180;
const REFRESH_TTL = 1800;
const RATE_WINDOW_SEC = 60;
const RATE_LIMIT = 30;

const ACCESS_KEY = (t) => `oauth:access:${t}`;
const REFRESH_KEY = (t) => `oauth:refresh:${t}`;
const CONSENT_KEY = (id) => `oauth:consent:${id}`;
const PARTNER_RATE_KEY = (partnerId) =>
  `rl:partner:${partnerId}:${Math.floor(Date.now() / 1000 / RATE_WINDOW_SEC)}`;
const ABUSE_KEY = (ip) => `abuse:${ip}`;

const hr = () => process.hrtime.bigint();
const ms = (s) => Number(Number((process.hrtime.bigint() - s)) / 1e6).toFixed(3);

export async function issueTokens({ partnerId, custId, scope }) {
  const accessToken = 'at_' + nanoid(18);
  const refreshToken = 'rt_' + nanoid(24);
  const consentId = 'csn_' + nanoid(10);
  const now = Date.now();
  const trace = [];

  let t = hr();
  await redis.hset(ACCESS_KEY(accessToken), {
    partnerId,
    custId,
    scope: scope || 'accounts.read,balances.read',
    consentId,
    issuedAt: String(now),
  });
  trace.push({
    cmd: `HSET oauth:access:${accessToken} partnerId ${partnerId} custId ${custId} scope ${scope || 'accounts.read,balances.read'} consentId ${consentId} issuedAt ${now}`,
    ms: Number(ms(t)),
  });
  t = hr();
  await redis.expire(ACCESS_KEY(accessToken), TOKEN_TTL);
  trace.push({ cmd: `EXPIRE oauth:access:${accessToken} ${TOKEN_TTL}`, ms: Number(ms(t)) });

  t = hr();
  await redis.hset(REFRESH_KEY(refreshToken), {
    partnerId,
    custId,
    consentId,
    issuedAt: String(now),
  });
  trace.push({
    cmd: `HSET oauth:refresh:${refreshToken} partnerId ${partnerId} custId ${custId} consentId ${consentId}`,
    ms: Number(ms(t)),
  });
  t = hr();
  await redis.expire(REFRESH_KEY(refreshToken), REFRESH_TTL);
  trace.push({ cmd: `EXPIRE oauth:refresh:${refreshToken} ${REFRESH_TTL}`, ms: Number(ms(t)) });

  t = hr();
  await redis.hset(CONSENT_KEY(consentId), {
    custId,
    partnerId,
    status: 'ACTIVE',
    grantedAt: String(now),
    scope: scope || 'accounts.read,balances.read',
  });
  trace.push({
    cmd: `HSET oauth:consent:${consentId} custId ${custId} partnerId ${partnerId} status ACTIVE scope ${scope || 'accounts.read,balances.read'}`,
    ms: Number(ms(t)),
  });
  t = hr();
  await redis.expire(CONSENT_KEY(consentId), REFRESH_TTL);
  trace.push({ cmd: `EXPIRE oauth:consent:${consentId} ${REFRESH_TTL}`, ms: Number(ms(t)) });

  metrics.inc('redisWrites', 3);
  broadcast('uc3:token', { action: 'issued', partnerId, custId, accessToken });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    consent_id: consentId,
    expires_in: TOKEN_TTL,
    refresh_expires_in: REFRESH_TTL,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
  };
}

export async function refreshToken(refreshTokenStr) {
  const data = await redis.hgetall(REFRESH_KEY(refreshTokenStr));
  if (!data.partnerId) return { error: 'invalid_refresh_token' };
  const fresh = await issueTokens({
    partnerId: data.partnerId,
    custId: data.custId,
  });
  return fresh;
}

export async function revokeConsent(consentId) {
  const trace = [];
  const t = hr();
  await redis.hset(CONSENT_KEY(consentId), 'status', 'REVOKED');
  trace.push({ cmd: `HSET oauth:consent:${consentId} status REVOKED`, ms: Number(ms(t)) });
  broadcast('uc3:token', { action: 'consent-revoked', consentId });
  return { consentId, trace, totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)) };
}

export async function listTokens() {
  const out = { access: [], refresh: [], consents: [] };
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'oauth:*', 'COUNT', 100);
    cursor = next;
    for (const k of batch) {
      const ttl = await redis.ttl(k);
      const data = await redis.hgetall(k);
      if (k.startsWith('oauth:access:')) out.access.push({ key: k, ttl, ...data });
      else if (k.startsWith('oauth:refresh:')) out.refresh.push({ key: k, ttl, ...data });
      else out.consents.push({ key: k, ttl, ...data });
    }
  } while (cursor !== '0');
  return out;
}

export async function partnerCall({ partnerId, accessToken, ip = '203.0.113.1' }) {
  const rateKey = PARTNER_RATE_KEY(partnerId);
  const trace = [];

  let t = hr();
  const count = await redis.incr(rateKey);
  trace.push({ cmd: `INCR ${rateKey}`, ms: Number(ms(t)) });
  if (count === 1) {
    t = hr();
    await redis.expire(rateKey, RATE_WINDOW_SEC);
    trace.push({ cmd: `EXPIRE ${rateKey} ${RATE_WINDOW_SEC}`, ms: Number(ms(t)) });
  }

  if (count > RATE_LIMIT) {
    t = hr();
    await redis.incr(ABUSE_KEY(ip));
    trace.push({ cmd: `INCR abuse:${ip}`, ms: Number(ms(t)) });
    t = hr();
    await redis.expire(ABUSE_KEY(ip), 300);
    trace.push({ cmd: `EXPIRE abuse:${ip} 300`, ms: Number(ms(t)) });
    broadcast('uc3:token', { action: 'rate-limited', partnerId, count });
    const out = {
      ok: false,
      error: 'rate_limited',
      remaining: 0,
      windowSec: RATE_WINDOW_SEC,
      count,
      limit: RATE_LIMIT,
    };
    return {
      ...out,
      trace,
      totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    };
  }

  t = hr();
  const tokenData = await redis.hgetall(ACCESS_KEY(accessToken));
  trace.push({ cmd: `HGETALL oauth:access:${accessToken}`, ms: Number(ms(t)) });
  if (!tokenData.partnerId) {
    return {
      ok: false,
      error: 'invalid_token',
      count,
      limit: RATE_LIMIT,
      trace,
      totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    };
  }
  t = hr();
  const consent = await redis.hgetall(CONSENT_KEY(tokenData.consentId));
  trace.push({
    cmd: `HGETALL oauth:consent:${tokenData.consentId}`,
    ms: Number(ms(t)),
  });
  if (consent.status !== 'ACTIVE') {
    return {
      ok: false,
      error: 'consent_revoked',
      count,
      limit: RATE_LIMIT,
      trace,
      totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    };
  }
  metrics.inc('redisReads', 2);
  broadcast('uc3:token', { action: 'api-call', partnerId, count });
  return {
    ok: true,
    custId: tokenData.custId,
    scope: tokenData.scope,
    remaining: RATE_LIMIT - count,
    count,
    limit: RATE_LIMIT,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
  };
}

export async function getRateUsage(partnerId) {
  const key = PARTNER_RATE_KEY(partnerId);
  const v = await redis.get(key);
  const ttl = await redis.ttl(key);
  return { partnerId, count: Number(v || 0), limit: RATE_LIMIT, ttl, windowSec: RATE_WINDOW_SEC };
}
