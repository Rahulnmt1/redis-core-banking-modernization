import { redis, withTiming } from '../redisClient.js';
import { pgPool } from '../pgClient.js';
import { metrics } from '../bus.js';
import { rebuildCust360 } from '../rdi.js';

const C360_KEY = (custId) => `cust360:${custId}`;
const INDEX_NAME = 'idx:cust360';

export async function ensureCust360Index() {
  try {
    await redis.call(
      'FT.CREATE',
      INDEX_NAME,
      'ON',
      'JSON',
      'PREFIX',
      '1',
      'cust360:',
      'SCHEMA',
      '$.custId',
      'AS',
      'custId',
      'TAG',
      '$.name',
      'AS',
      'name',
      'TEXT',
      '$.segment',
      'AS',
      'segment',
      'TAG',
      '$.city',
      'AS',
      'city',
      'TAG',
      '$.totalRelationship',
      'AS',
      'totalRelationship',
      'NUMERIC',
      'SORTABLE'
    );
  } catch (e) {
    if (!String(e.message).includes('Index already exists')) throw e;
  }
}

export async function readFromRedis(custId) {
  const { result, ms } = await withTiming(async () => {
    const json = await redis.call('JSON.GET', C360_KEY(custId), '$');
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  });
  if (result) metrics.inc('redisReads');
  return { source: 'redis', latencyMs: ms, data: result };
}

export async function readFromPostgres(custId) {
  const start = process.hrtime.bigint();
  const r = await pgPool.query(
    `SELECT
       c.*,
       (SELECT json_agg(a) FROM accounts a WHERE a.cust_id = c.cust_id) AS accounts,
       (SELECT json_agg(l) FROM loans l WHERE l.cust_id = c.cust_id) AS loans,
       (SELECT json_agg(card) FROM cards card WHERE card.cust_id = c.cust_id) AS cards,
       (SELECT json_agg(t) FROM (
          SELECT t.* FROM transactions t
          JOIN accounts a ON a.acct_id = t.acct_id
          WHERE a.cust_id = c.cust_id
          ORDER BY t.ts DESC LIMIT 5
       ) t) AS recent_txns,
       (SELECT COALESCE(SUM(balance),0) FROM accounts a WHERE a.cust_id = c.cust_id) AS total_balance,
       (SELECT COALESCE(SUM(outstanding),0) FROM loans l WHERE l.cust_id = c.cust_id) AS total_loan
     FROM customers c
     WHERE c.cust_id = $1`,
    [custId]
  );
  if (r.rowCount === 0) {
    return { source: 'postgres', latencyMs: 0, data: null };
  }
  const c = r.rows[0];
  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
  metrics.inc('cbsReads');
  const txns = (c.recent_txns || []).map((t) => ({
    txnId: t.txn_id,
    acctId: t.acct_id,
    type: t.type,
    amount: Number(t.amount),
    channel: t.channel,
    narrative: t.narrative,
    ts: t.ts,
  }));
  const accounts = (c.accounts || []).map((a) => ({
    acctId: a.acct_id,
    type: a.type,
    balance: Number(a.balance),
    currency: a.currency || 'INR',
  }));
  const cards = (c.cards || []).map((card) => ({
    cardId: card.card_id,
    type: card.type,
    limit: Number(card.limit),
    used: Number(card.used || 0),
  }));
  const loans = (c.loans || []).map((l) => ({
    loanId: l.loan_id,
    product: l.product,
    principal: Number(l.principal || 0),
    outstanding: Number(l.outstanding),
  }));
  const totalCardLimit = cards.reduce((s, x) => s + x.limit, 0);
  const totalCardUsed = cards.reduce((s, x) => s + x.used, 0);
  return {
    source: 'postgres',
    latencyMs: Number(ms.toFixed(3)),
    data: {
      custId: c.cust_id,
      name: c.name,
      segment: c.segment,
      kyc: c.kyc,
      city: c.city,
      email: c.email,
      phone: c.phone,
      accounts,
      loans,
      cards,
      recentTxns: txns,
      summary: {
        totalBalance: Number(c.total_balance || 0),
        totalLoanOutstanding: Number(c.total_loan || 0),
        cardLimit: totalCardLimit,
        cardUsed: totalCardUsed,
        productCount: accounts.length + loans.length + cards.length,
      },
      totalRelationship: Number(c.total_balance || 0) + Number(c.total_loan || 0),
    },
  };
}

export async function syncCustomerToRedis(custId) {
  const doc = await rebuildCust360(custId);
  return doc;
}

export async function syncAllCustomers() {
  const ids = (await pgPool.query('SELECT cust_id FROM customers')).rows.map((r) => r.cust_id);
  for (const id of ids) await rebuildCust360(id);
  return ids.length;
}

export async function searchCustomers(q) {
  const sanitized = sanitizeFtQuery(q);
  const query = sanitized.length > 0 ? `*${sanitized}*` : '*';
  const command = `FT.SEARCH ${INDEX_NAME} "${query}" LIMIT 0 10 RETURN 4 custId name segment city`;
  const start = process.hrtime.bigint();
  let res;
  try {
    res = await redis.call(
      'FT.SEARCH',
      INDEX_NAME,
      query,
      'LIMIT',
      '0',
      '10',
      'RETURN',
      '4',
      'custId',
      'name',
      'segment',
      'city'
    );
  } catch (e) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    return { total: 0, docs: [], error: e.message, command, latencyMs: Number(ms.toFixed(3)) };
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const total = res[0];
  const docs = [];
  for (let i = 1; i < res.length; i += 2) {
    const fields = res[i + 1];
    const obj = {};
    for (let j = 0; j < fields.length; j += 2) obj[fields[j]] = fields[j + 1];
    docs.push(obj);
  }
  return { total, docs, command, latencyMs: Number(ms.toFixed(3)) };
}

function sanitizeFtQuery(s) {
  if (!s) return '';
  return s
    .replace(/[^A-Za-z0-9 _-]/g, ' ')
    .trim()
    .slice(0, 64);
}

export async function listCust360Keys() {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'cust360:*', 'COUNT', 50);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  return keys;
}

export async function listCustomers({ q = '', segment = '', limit = 50, offset = 0 } = {}) {
  const whereParts = [];
  const params = [];
  if (q && q.trim().length > 0) {
    whereParts.push(`(cust_id ILIKE $${params.length + 1} OR name ILIKE $${params.length + 1} OR city ILIKE $${params.length + 1})`);
    params.push(`%${q.trim()}%`);
  }
  if (segment && segment !== 'ALL') {
    whereParts.push(`segment = $${params.length + 1}`);
    params.push(segment);
  }
  const where = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);
  const sql = `SELECT * FROM customers ${where} ORDER BY cust_id LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const rows = (await pgPool.query(sql, params)).rows;

  const totalRow = await pgPool.query(
    `SELECT count(*)::int AS c FROM customers ${where}`,
    params.slice(0, -2)
  );
  return {
    total: totalRow.rows[0].c,
    items: rows.map((r) => ({
      custId: r.cust_id,
      name: r.name,
      segment: r.segment,
      city: r.city,
      email: r.email,
      phone: r.phone,
    })),
  };
}

export async function syncedKeyCount() {
  const keys = await listCust360Keys();
  return keys.length;
}
