import pg from 'pg';

const { Pool, Client } = pg;

export const PG_URL = process.env.PG_URL || 'postgres://cbs:cbs@127.0.0.1:5433/cbs';

export const pgPool = new Pool({ connectionString: PG_URL, max: 10 });

pgPool.on('error', (e) => console.error('[pg] pool error', e.message));

export function pgClient() {
  return new Client({ connectionString: PG_URL });
}

export async function pgQuery(text, params = []) {
  const start = process.hrtime.bigint();
  const res = await pgPool.query(text, params);
  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
  return { rows: res.rows, ms: Number(ms.toFixed(3)) };
}
