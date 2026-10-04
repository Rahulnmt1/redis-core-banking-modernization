import { redis } from '../redisClient.js';

const PREFIXES = [
  { id: 'cust360', match: 'cust360:*', label: 'Customer 360 (JSON)', kind: 'JSON' },
  { id: 'session', match: 'session:*', label: 'Sessions (Hash)', kind: 'HASH' },
  { id: 'oauth', match: 'oauth:*', label: 'OAuth tokens & consent (Hash)', kind: 'HASH' },
  { id: 'rl', match: 'rl:*', label: 'Rate limiters (String)', kind: 'STRING' },
  { id: 'streams', match: 'stream:*', label: 'Streams', kind: 'STREAM' },
  { id: 'readmodel', match: 'readmodel:*', label: 'CQRS Read Models (JSON)', kind: 'JSON' },
  { id: 'fraud', match: 'fraud:*', label: 'Fraud counters & sets', kind: 'MIXED' },
  { id: 'recon', match: 'recon:*', label: 'Reconciliation state', kind: 'MIXED' },
];

export async function summary() {
  const out = [];
  for (const p of PREFIXES) {
    let count = 0;
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', p.match, 'COUNT', 200);
      count += batch.length;
      cursor = next;
    } while (cursor !== '0');
    out.push({ ...p, count });
  }
  const dbsize = await redis.dbsize();
  return { prefixes: out, dbsize };
}

export async function listKeys(prefix) {
  const def = PREFIXES.find((p) => p.id === prefix);
  if (!def) return { keys: [] };
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', def.match, 'COUNT', 200);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  return { keys: keys.slice(0, 200), total: keys.length };
}

export async function inspect(key) {
  const type = await redis.type(key);
  const ttl = await redis.ttl(key);
  let value = null;
  switch (type) {
    case 'string':
      value = await redis.get(key);
      break;
    case 'hash':
      value = await redis.hgetall(key);
      break;
    case 'set':
      value = await redis.smembers(key);
      break;
    case 'zset':
      value = await redis.zrange(key, 0, -1, 'WITHSCORES');
      break;
    case 'list':
      value = await redis.lrange(key, 0, 50);
      break;
    case 'stream': {
      const len = await redis.xlen(key);
      const sample = await redis.xrevrange(key, '+', '-', 'COUNT', 5);
      value = { length: len, sample };
      break;
    }
    case 'ReJSON-RL':
    case 'json': {
      const json = await redis.call('JSON.GET', key, '$');
      value = json ? JSON.parse(json) : null;
      break;
    }
    default:
      value = null;
  }
  return { key, type, ttl, value };
}
