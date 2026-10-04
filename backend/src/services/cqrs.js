import { pgPool } from '../pgClient.js';
import { withTiming } from '../redisClient.js';
import { redis } from '../redisClient.js';
import { metrics } from '../bus.js';
import { rebuildAccountReadModel } from '../rdi.js';

export async function listAccounts() {
  const rows = (await pgPool.query('SELECT * FROM accounts ORDER BY acct_id')).rows;
  return rows.map((r) => ({
    acctId: r.acct_id,
    custId: r.cust_id,
    type: r.type,
    balance: Number(r.balance),
    currency: r.currency,
  }));
}

export async function commandWriteToCBS({ acctId, type, amount, channel, narrative }) {
  const trace = [];
  let t = process.hrtime.bigint();
  const acct = (await pgPool.query('SELECT * FROM accounts WHERE acct_id = $1', [acctId])).rows[0];
  trace.push({
    cmd: `SELECT * FROM accounts WHERE acct_id = '${acctId}';`,
    ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
  });
  if (!acct) throw new Error('Account not found');
  const delta = type === 'CREDIT' ? Number(amount) : -Number(amount);
  const newBalance = Math.round((Number(acct.balance) + delta) * 100) / 100;
  const txnId = 'TXN' + Date.now();
  const ts = new Date();

  const client = await pgPool.connect();
  try {
    t = process.hrtime.bigint();
    await client.query('BEGIN');
    trace.push({
      cmd: 'BEGIN;',
      ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
    });
    t = process.hrtime.bigint();
    await client.query('UPDATE accounts SET balance=$1, updated_at=now() WHERE acct_id=$2', [
      newBalance,
      acctId,
    ]);
    trace.push({
      cmd: `UPDATE accounts SET balance=${newBalance}, updated_at=now() WHERE acct_id='${acctId}';`,
      ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
    });
    t = process.hrtime.bigint();
    await client.query(
      `INSERT INTO transactions (txn_id,acct_id,type,amount,channel,narrative,ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [txnId, acctId, type, amount, channel || 'API', narrative || 'CQRS test', ts]
    );
    trace.push({
      cmd: `INSERT INTO transactions (txn_id, acct_id, type, amount, channel, narrative, ts)
  VALUES ('${txnId}', '${acctId}', '${type}', ${amount}, '${channel || 'API'}', '${narrative || 'CQRS test'}', now());`,
      ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
    });
    t = process.hrtime.bigint();
    await client.query('COMMIT');
    trace.push({
      cmd: 'COMMIT;  -- triggers RDI CDC → JSON.SET readmodel:account:<id>',
      ms: Number((Number(process.hrtime.bigint() - t) / 1e6).toFixed(3)),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    txnId,
    acctId,
    newBalance,
    ts: ts.getTime(),
    trace,
    totalLatencyMs: Number(trace.reduce((s, x) => s + x.ms, 0).toFixed(3)),
  };
}

export async function queryFromRedis(acctId) {
  const { result, ms } = await withTiming(async () => {
    const json = await redis.call('JSON.GET', `readmodel:account:${acctId}`, '$');
    if (!json) return null;
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  });
  if (result) metrics.inc('redisReads');
  return {
    source: 'redis-readmodel',
    latencyMs: ms,
    command: `JSON.GET readmodel:account:${acctId} $`,
    data: result,
  };
}

export async function queryFromPostgres(acctId) {
  const start = process.hrtime.bigint();
  const acct = (await pgPool.query('SELECT * FROM accounts WHERE acct_id = $1', [acctId])).rows[0];
  const last = (
    await pgPool.query(
      'SELECT * FROM transactions WHERE acct_id = $1 ORDER BY ts DESC LIMIT 1',
      [acctId]
    )
  ).rows[0];
  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
  metrics.inc('cbsReads');
  return {
    source: 'postgres',
    latencyMs: Number(ms.toFixed(3)),
    command: `SELECT * FROM accounts WHERE acct_id = '${acctId}';
SELECT * FROM transactions
  WHERE acct_id = '${acctId}'
  ORDER BY ts DESC LIMIT 1;`,
    data: acct
      ? {
          acctId: acct.acct_id,
          balance: Number(acct.balance),
          lastTxn: last
            ? {
                txnId: last.txn_id,
                type: last.type,
                amount: Number(last.amount),
              }
            : null,
        }
      : null,
  };
}

export async function listReadModels() {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', 'readmodel:account:*', 'COUNT', 100);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  const out = [];
  for (const k of keys) {
    const json = await redis.call('JSON.GET', k, '$');
    if (json) {
      const parsed = JSON.parse(json);
      out.push({ key: k, ...(Array.isArray(parsed) ? parsed[0] : parsed) });
    }
  }
  return out;
}

export async function manualResync(acctId) {
  return rebuildAccountReadModel(acctId);
}
