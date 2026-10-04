import express from 'express';
import cors from 'cors';
import { redis } from './redisClient.js';
import { pgPool } from './pgClient.js';
import { initSchema } from './pgSchema.js';
import { startRDI, fullResync, rdiStatus, rebuildAllCustomersBatch } from './rdi.js';
import { addClient, broadcast, metrics } from './bus.js';
import * as c360 from './services/customer360.js';
import * as sess from './services/sessions.js';
import * as ob from './services/openBanking.js';
import * as streams from './services/streams.js';
import * as cqrs from './services/cqrs.js';
import * as fraud from './services/fraud.js';
import * as recon from './services/reconciliation.js';
import * as inspector from './services/inspector.js';
import { benchmarks } from './services/benchmarks.js';

process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e?.message || e);
});
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e?.message || e);
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    const pong = await redis.ping();
    const pg = await pgPool.query('SELECT 1');
    res.json({ ok: true, redis: pong, postgres: pg.rowCount === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/cluster', async (_req, res) => {
  try {
    const info = await redis.info('server');
    const memory = await redis.info('memory');
    const stats = await redis.info('stats');
    const dbsize = await redis.dbsize();
    const parse = (text, key) => {
      const m = text.match(new RegExp(`^${key}:(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };
    res.json({
      version: parse(info, 'redis_version'),
      mode: parse(info, 'redis_mode'),
      os: parse(info, 'os'),
      uptime_seconds: Number(parse(info, 'uptime_in_seconds') || 0),
      used_memory_human: parse(memory, 'used_memory_human'),
      used_memory_peak_human: parse(memory, 'used_memory_peak_human'),
      total_connections_received: Number(parse(stats, 'total_connections_received') || 0),
      total_commands_processed: Number(parse(stats, 'total_commands_processed') || 0),
      instantaneous_ops_per_sec: Number(parse(stats, 'instantaneous_ops_per_sec') || 0),
      keys: dbsize,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/rdi/status', (_req, res) => {
  res.json(rdiStatus());
});

app.post('/api/rdi/resync', async (req, res) => {
  const max = Number(req.query.max) || null;
  res.json(await rebuildAllCustomersBatch({ batchSize: 500, max }));
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  addClient(res);
});

app.get('/api/metrics', (_req, res) => {
  res.json(metrics.snapshot());
});

app.get('/api/customers', async (req, res) => {
  res.json(
    await c360.listCustomers({
      q: req.query.q || '',
      segment: req.query.segment || '',
      limit: req.query.limit,
      offset: req.query.offset,
    })
  );
});

app.get('/api/customers/stats', async (_req, res) => {
  const total = await pgPool.query('SELECT count(*)::int AS c FROM customers');
  const accts = await pgPool.query('SELECT count(*)::int AS c FROM accounts');
  const txns = await pgPool.query('SELECT count(*)::int AS c FROM transactions');
  const loans = await pgPool.query('SELECT count(*)::int AS c FROM loans');
  const cards = await pgPool.query('SELECT count(*)::int AS c FROM cards');
  const synced = await c360.syncedKeyCount();
  res.json({
    customers: total.rows[0].c,
    accounts: accts.rows[0].c,
    transactions: txns.rows[0].c,
    loans: loans.rows[0].c,
    cards: cards.rows[0].c,
    cust360Synced: synced,
  });
});

app.post('/api/uc1/sync-all', async (req, res) => {
  const max = Number(req.query.max) || 1000;
  const out = await rebuildAllCustomersBatch({ batchSize: 250, max });
  res.json({ synced: out.customers });
});
app.post('/api/uc1/sync/:custId', async (req, res) => {
  const doc = await c360.syncCustomerToRedis(req.params.custId);
  if (!doc) return res.status(404).json({ error: 'not found' });
  res.json({ synced: true, doc });
});
app.get('/api/uc1/redis/:custId', async (req, res) => {
  res.json(await c360.readFromRedis(req.params.custId));
});
app.get('/api/uc1/postgres/:custId', async (req, res) => {
  res.json(await c360.readFromPostgres(req.params.custId));
});
app.get('/api/uc1/keys', async (_req, res) => {
  res.json({ keys: await c360.listCust360Keys() });
});
app.get('/api/uc1/search', async (req, res) => {
  res.json(await c360.searchCustomers(req.query.q || ''));
});

app.post('/api/uc2/sessions', async (req, res) => res.json(await sess.createSession(req.body || {})));
app.get('/api/uc2/sessions', async (_req, res) => res.json(await sess.listAllSessions()));
app.post('/api/uc2/sessions/:id/touch', async (req, res) => {
  const out = await sess.touchSession(req.params.id);
  if (!out) return res.status(404).json({ error: 'not found' });
  res.json(out);
});
app.post('/api/uc2/sessions/:id/mfa', async (req, res) => {
  const out = await sess.completeMFA(req.params.id);
  if (!out) return res.status(404).json({ error: 'not found' });
  res.json(out);
});
app.delete('/api/uc2/sessions/:id', async (req, res) => res.json(await sess.revokeSession(req.params.id)));
app.get('/api/uc2/sessions/:id', async (req, res) => res.json(await sess.readSession(req.params.id)));

app.post('/api/uc3/tokens', async (req, res) => res.json(await ob.issueTokens(req.body || {})));
app.post('/api/uc3/tokens/refresh', async (req, res) =>
  res.json(await ob.refreshToken((req.body || {}).refresh_token))
);
app.post('/api/uc3/consent/:id/revoke', async (req, res) => res.json(await ob.revokeConsent(req.params.id)));
app.get('/api/uc3/state', async (_req, res) => res.json(await ob.listTokens()));
app.post('/api/uc3/call', async (req, res) => res.json(await ob.partnerCall(req.body || {})));
app.get('/api/uc3/rate/:partnerId', async (req, res) => res.json(await ob.getRateUsage(req.params.partnerId)));

app.post('/api/uc4/publish', async (req, res) => {
  const { stream, fields } = req.body || {};
  const out = await streams.publish(stream, fields || {});
  res.json(out);
});
app.get('/api/uc4/streams', async (_req, res) =>
  res.json({
    list: streams.STREAMS,
    stats: await streams.streamStats(),
    groups: await streams.consumerGroups(),
  })
);
app.get('/api/uc4/tail/:stream', async (req, res) =>
  res.json(await streams.tail(req.params.stream, Number(req.query.count) || 20))
);
app.post('/api/uc4/consume', async (req, res) => {
  const { stream, group, consumer } = req.body || {};
  res.json(await streams.consumeOne(stream, group, consumer || 'demo-1'));
});

app.get('/api/uc5/accounts', async (_req, res) => res.json(await cqrs.listAccounts()));
app.post('/api/uc5/command', async (req, res) => {
  try {
    res.json(await cqrs.commandWriteToCBS(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get('/api/uc5/redis/:acctId', async (req, res) => res.json(await cqrs.queryFromRedis(req.params.acctId)));
app.get('/api/uc5/postgres/:acctId', async (req, res) => res.json(await cqrs.queryFromPostgres(req.params.acctId)));
app.get('/api/uc5/readmodels', async (_req, res) => res.json(await cqrs.listReadModels()));

app.post('/api/uc6/check', async (req, res) => res.json(await fraud.checkTransaction(req.body || {})));
app.get('/api/uc6/state/:custId', async (req, res) => res.json(await fraud.fraudState(req.params.custId)));
app.get('/api/uc6/decisions', async (_req, res) => res.json(await fraud.listRecentDecisions(20)));
app.post('/api/uc6/limits/:custId', async (req, res) => res.json(await fraud.setLimits(req.params.custId, req.body || {})));
app.post('/api/uc6/watchlist/add', async (req, res) => res.json(await fraud.addToWatchlist((req.body || {}).member)));
app.post('/api/uc6/watchlist/remove', async (req, res) => res.json(await fraud.removeFromWatchlist((req.body || {}).member)));

app.post('/api/uc7/emit', async (req, res) => res.json(await recon.emitSwitchTxn(req.body || {})));
app.get('/api/uc7/stats', async (_req, res) => res.json(await recon.reconStats()));

app.post('/api/bench/:uc', async (req, res) => {
  const fn = benchmarks[req.params.uc];
  if (!fn) return res.status(404).json({ error: 'unknown benchmark' });
  try {
    const iterations = Number(req.query.iterations) || 25;
    const result = await fn(...(req.params.uc === 'uc1' || req.params.uc === 'uc5'
      ? [req.body?.target || undefined, iterations]
      : [iterations]));
    broadcast('bench:result', { uc: req.params.uc, ...result });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/inspect/summary', async (_req, res) => res.json(await inspector.summary()));
app.get('/api/inspect/keys/:prefix', async (req, res) => res.json(await inspector.listKeys(req.params.prefix)));
app.get('/api/inspect/key', async (req, res) => res.json(await inspector.inspect(req.query.key)));

const PORT = process.env.PORT || 4000;

(async () => {
  await initSchema();
  await streams.ensureGroups();
  await c360.ensureCust360Index();
  await fraud.ensureWatchlist();
  await fullResync();
  await startRDI();

  setInterval(() => broadcast('metrics', metrics.snapshot()), 2000);
  setInterval(async () => broadcast('rdi:status', rdiStatus()), 2000);

  app.listen(PORT, () => {
    console.log(`[redis-cbs] backend listening on http://localhost:${PORT}`);
  });
})();
