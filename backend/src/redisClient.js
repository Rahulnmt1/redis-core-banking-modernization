import Redis from 'ioredis';

export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:12000';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
});

redis.on('error', (e) => {
  console.error('[redis] error', e.message);
});

export async function withTiming(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1_000_000;
  return { result, ms: Number(ms.toFixed(3)) };
}
