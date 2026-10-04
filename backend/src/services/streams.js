import { redis } from '../redisClient.js';
import { broadcast, metrics } from '../bus.js';

export const STREAMS = {
  CBS_TXN: 'stream:cbs.transactions',
  PAYMENTS: 'stream:payments.switch',
  CRM_EVENTS: 'stream:crm.events',
  NOTIFICATIONS: 'stream:notifications',
};

export const CONSUMER_GROUPS = [
  { stream: STREAMS.CBS_TXN, group: 'g.notifier' },
  { stream: STREAMS.CBS_TXN, group: 'g.analytics' },
  { stream: STREAMS.CBS_TXN, group: 'g.fraud' },
  { stream: STREAMS.PAYMENTS, group: 'g.recon' },
  { stream: STREAMS.CRM_EVENTS, group: 'g.timeline' },
];

export async function ensureGroups() {
  for (const { stream, group } of CONSUMER_GROUPS) {
    try {
      await redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (e) {
      if (!String(e.message).includes('BUSYGROUP')) throw e;
    }
  }
}

export async function publish(stream, fields) {
  const flat = [];
  for (const [k, v] of Object.entries(fields)) flat.push(k, String(v));
  const start = process.hrtime.bigint();
  const id = await redis.xadd(stream, '*', ...flat);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  metrics.inc('streamsPublished');
  broadcast('uc4:publish', { stream, id, fields, ts: Date.now() });
  return {
    id,
    stream,
    fields,
    command: `XADD ${stream} * ${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join(' ')}`,
    latencyMs: Number(ms.toFixed(3)),
  };
}

export async function tail(stream, count = 20) {
  const start = process.hrtime.bigint();
  const entries = await redis.xrevrange(stream, '+', '-', 'COUNT', count);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const out = entries.map(([id, fields]) => {
    const obj = {};
    for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
    return { id, fields: obj };
  });
  return {
    entries: out,
    command: `XREVRANGE ${stream} + - COUNT ${count}`,
    latencyMs: Number(ms.toFixed(3)),
  };
}

export async function streamStats() {
  const out = {};
  for (const stream of Object.values(STREAMS)) {
    try {
      const len = await redis.xlen(stream);
      out[stream] = { length: len };
    } catch {
      out[stream] = { length: 0 };
    }
  }
  return out;
}

export async function consumerGroups() {
  const out = [];
  for (const stream of Object.values(STREAMS)) {
    try {
      const groups = await redis.xinfo('GROUPS', stream);
      for (const g of groups) {
        const obj = {};
        for (let i = 0; i < g.length; i += 2) obj[g[i]] = g[i + 1];
        out.push({ stream, ...obj });
      }
    } catch {
      /* stream not yet created */
    }
  }
  return out;
}

export async function consumeOne(stream, group, consumer) {
  const trace = [];
  let t = process.hrtime.bigint();
  const res = await redis.xreadgroup(
    'GROUP',
    group,
    consumer,
    'COUNT',
    1,
    'BLOCK',
    50,
    'STREAMS',
    stream,
    '>'
  );
  trace.push({
    cmd: `XREADGROUP GROUP ${group} ${consumer} COUNT 1 BLOCK 50 STREAMS ${stream} >`,
    ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
  });
  if (!res) {
    return {
      empty: true,
      trace,
      totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    };
  }
  const [, entries] = res[0];
  if (!entries || entries.length === 0) {
    return {
      empty: true,
      trace,
      totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
    };
  }
  const [id, fields] = entries[0];
  t = process.hrtime.bigint();
  await redis.xack(stream, group, id);
  trace.push({
    cmd: `XACK ${stream} ${group} ${id}`,
    ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
  });
  metrics.inc('streamsConsumed');
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
  broadcast('uc4:consume', { stream, group, consumer, id, fields: obj, ts: Date.now() });
  return {
    id,
    fields: obj,
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
  };
}
