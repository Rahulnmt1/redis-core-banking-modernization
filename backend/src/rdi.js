import { pgClient, pgPool } from './pgClient.js';
import { redis } from './redisClient.js';
import { broadcast, metrics } from './bus.js';

const C360_KEY = (cid) => `cust360:${cid}`;
const READ_MODEL_KEY = (acctId) => `readmodel:account:${acctId}`;

const state = {
  status: 'starting',
  startedAt: 0,
  lastEventAt: 0,
  bytesProcessed: 0,
  eventsProcessed: 0,
  bySource: {},
  rolling: [],
  lagSamplesMs: [],
};

export function rdiStatus() {
  const now = Date.now();
  const recent = state.rolling.filter((t) => now - t < 5000).length;
  const eps = recent / 5;
  const avgLag =
    state.lagSamplesMs.length > 0
      ? state.lagSamplesMs.reduce((a, b) => a + b, 0) / state.lagSamplesMs.length
      : 0;
  return {
    status: state.status,
    startedAt: state.startedAt,
    lastEventAt: state.lastEventAt,
    eventsProcessed: state.eventsProcessed,
    bytesProcessed: state.bytesProcessed,
    bySource: state.bySource,
    eventsPerSec: Number(eps.toFixed(2)),
    avgLagMs: Number(avgLag.toFixed(2)),
  };
}

export async function startRDI() {
  const client = pgClient();
  await client.connect();
  await client.query('LISTEN cbs_cdc');

  state.status = 'running';
  state.startedAt = Date.now();

  client.on('notification', async (msg) => {
    if (msg.channel !== 'cbs_cdc') return;
    let payload;
    try {
      payload = JSON.parse(msg.payload);
    } catch {
      return;
    }
    const t0 = Date.now();
    state.lastEventAt = t0;
    state.eventsProcessed += 1;
    state.bytesProcessed += msg.payload.length;
    state.bySource[payload.table] = (state.bySource[payload.table] || 0) + 1;
    state.rolling.push(t0);
    if (state.rolling.length > 200) state.rolling.shift();

    try {
      await applyChange(payload);
      const lag = Date.now() - (payload.ts || t0);
      state.lagSamplesMs.push(lag);
      if (state.lagSamplesMs.length > 50) state.lagSamplesMs.shift();
      broadcast('rdi:event', {
        op: payload.op,
        table: payload.table,
        key: payload.key,
        latencyMs: Date.now() - t0,
        lagMs: lag,
        ts: t0,
      });
    } catch (err) {
      console.error('[rdi] apply error', err.message);
    }
  });

  client.on('error', (e) => {
    console.error('[rdi] error', e.message);
    state.status = 'error';
  });
}

async function applyChange(payload) {
  const { table, row, key } = payload;
  if (table === 'customers' || table === 'accounts' || table === 'loans' || table === 'cards') {
    const custId = table === 'customers' ? row.cust_id : row.cust_id;
    if (custId) await rebuildCust360(custId);
  }
  if (table === 'accounts') {
    const acctId = row.acct_id;
    if (acctId) await rebuildAccountReadModel(acctId);
  }
  if (table === 'transactions') {
    const acctId = row.acct_id;
    if (acctId) {
      await rebuildAccountReadModel(acctId);
      const cust = await pgPool.query('SELECT cust_id FROM accounts WHERE acct_id = $1', [acctId]);
      if (cust.rows[0]?.cust_id) await rebuildCust360(cust.rows[0].cust_id);
      await redis.xadd(
        'stream:cbs.transactions',
        'MAXLEN',
        '~',
        '500',
        '*',
        'eventType',
        'transaction.posted',
        'txnId',
        row.txn_id,
        'acctId',
        acctId,
        'type',
        row.type,
        'amount',
        String(row.amount),
        'channel',
        row.channel || '',
        'ts',
        String(payload.ts || Date.now())
      );
      metrics.inc('streamsPublished');
    }
  }
}

export async function rebuildCust360(custId) {
  const cust = await pgPool.query('SELECT * FROM customers WHERE cust_id = $1', [custId]);
  if (cust.rowCount === 0) return null;
  const c = cust.rows[0];

  const accounts = (await pgPool.query('SELECT * FROM accounts WHERE cust_id = $1', [custId])).rows;
  const loans = (await pgPool.query('SELECT * FROM loans WHERE cust_id = $1', [custId])).rows;
  const cards = (await pgPool.query('SELECT * FROM cards WHERE cust_id = $1', [custId])).rows;

  const acctIds = accounts.map((a) => a.acct_id);
  const recentTxns =
    acctIds.length > 0
      ? (
          await pgPool.query(
            'SELECT * FROM transactions WHERE acct_id = ANY($1) ORDER BY ts DESC LIMIT 5',
            [acctIds]
          )
        ).rows
      : [];

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const totalLoanOutstanding = loans.reduce((s, l) => s + Number(l.outstanding), 0);
  const cardLimit = cards.reduce((s, c) => s + Number(c.limit || 0), 0);

  const doc = {
    custId: c.cust_id,
    name: c.name,
    segment: c.segment,
    kyc: c.kyc,
    city: c.city,
    email: c.email,
    phone: c.phone,
    accounts: accounts.map((a) => ({
      acctId: a.acct_id,
      type: a.type,
      balance: Number(a.balance),
      currency: a.currency,
    })),
    loans: loans.map((l) => ({
      loanId: l.loan_id,
      product: l.product,
      principal: Number(l.principal),
      outstanding: Number(l.outstanding),
    })),
    cards: cards.map((card) => ({
      cardId: card.card_id,
      type: card.type,
      limit: Number(card.limit),
      used: Number(card.used),
    })),
    recentTxns: recentTxns.map((t) => ({
      txnId: t.txn_id,
      acctId: t.acct_id,
      type: t.type,
      amount: Number(t.amount),
      channel: t.channel,
      narrative: t.narrative,
      ts: new Date(t.ts).getTime(),
    })),
    summary: {
      totalBalance,
      totalLoanOutstanding,
      cardLimit,
      productCount: accounts.length + loans.length + cards.length,
    },
    totalRelationship: Math.round(totalBalance + totalLoanOutstanding),
    lastSyncedAt: Date.now(),
  };
  await redis.call('JSON.SET', C360_KEY(custId), '$', JSON.stringify(doc));
  metrics.inc('redisWrites');
  return doc;
}

export async function rebuildAccountReadModel(acctId) {
  const a = (await pgPool.query('SELECT * FROM accounts WHERE acct_id = $1', [acctId])).rows[0];
  if (!a) return null;
  const last = (
    await pgPool.query(
      'SELECT * FROM transactions WHERE acct_id = $1 ORDER BY ts DESC LIMIT 1',
      [acctId]
    )
  ).rows[0];
  const doc = {
    acctId: a.acct_id,
    custId: a.cust_id,
    type: a.type,
    balance: Number(a.balance),
    currency: a.currency,
    lastTxnId: last?.txn_id || null,
    lastTxnType: last?.type || null,
    lastTxnAmount: last ? Number(last.amount) : null,
    lastUpdatedAt: Date.now(),
  };
  await redis.call('JSON.SET', `readmodel:account:${acctId}`, '$', JSON.stringify(doc));
  metrics.inc('redisWrites');
  return doc;
}

export async function fullResync(opts = {}) {
  const custLimit = opts.customers ?? 250;
  const acctLimit = opts.accounts ?? 500;
  const custIds = (
    await pgPool.query('SELECT cust_id FROM customers ORDER BY cust_id LIMIT $1', [custLimit])
  ).rows.map((r) => r.cust_id);
  for (const cid of custIds) await rebuildCust360(cid);
  const acctIds = (
    await pgPool.query('SELECT acct_id FROM accounts ORDER BY acct_id LIMIT $1', [acctLimit])
  ).rows.map((r) => r.acct_id);
  for (const aid of acctIds) await rebuildAccountReadModel(aid);
  return { customers: custIds.length, accounts: acctIds.length };
}

export async function rebuildAllCustomersBatch({ batchSize = 500, max = null } = {}) {
  let total = 0;
  let offset = 0;
  while (true) {
    const rows = (
      await pgPool.query(
        'SELECT cust_id FROM customers ORDER BY cust_id LIMIT $1 OFFSET $2',
        [batchSize, offset]
      )
    ).rows;
    if (rows.length === 0) break;
    for (const r of rows) await rebuildCust360(r.cust_id);
    total += rows.length;
    offset += rows.length;
    if (max && total >= max) break;
  }
  return { customers: total };
}
