import { pgPool } from './pgClient.js';
import {
  generateCustomers,
  generateAccounts,
  generateLoans,
  generateCards,
  generateTransactions,
  SCALE,
} from './data/dataGen.js';

export async function initSchema() {
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        cust_id text PRIMARY KEY,
        name text, segment text, kyc text, city text, email text, phone text,
        updated_at timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS accounts (
        acct_id text PRIMARY KEY,
        cust_id text REFERENCES customers(cust_id),
        type text, balance numeric(18,2), currency text,
        updated_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_cust ON accounts(cust_id);
      CREATE TABLE IF NOT EXISTS loans (
        loan_id text PRIMARY KEY,
        cust_id text REFERENCES customers(cust_id),
        product text, principal numeric(18,2), outstanding numeric(18,2),
        updated_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_loans_cust ON loans(cust_id);
      CREATE TABLE IF NOT EXISTS cards (
        card_id text PRIMARY KEY,
        cust_id text REFERENCES customers(cust_id),
        type text, "limit" numeric(18,2), used numeric(18,2),
        updated_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_cards_cust ON cards(cust_id);
      CREATE TABLE IF NOT EXISTS transactions (
        txn_id text PRIMARY KEY,
        acct_id text REFERENCES accounts(acct_id),
        type text, amount numeric(18,2), channel text, narrative text,
        ts timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_txn_acct_ts ON transactions(acct_id, ts DESC);
    `);

    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops)'
      );
      await client.query(
        'CREATE INDEX IF NOT EXISTS idx_customers_segment ON customers(segment)'
      );
      await client.query('CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city)');
    } catch (e) {
      console.log('[pg] trgm extension unavailable — basic indexes only');
    }

    await client.query(`
      CREATE OR REPLACE FUNCTION cbs_notify_change() RETURNS trigger AS $$
      DECLARE
        rec_json jsonb;
        keyval text;
        payload json;
      BEGIN
        IF (TG_OP = 'DELETE') THEN
          rec_json := to_jsonb(OLD);
        ELSE
          rec_json := to_jsonb(NEW);
        END IF;
        keyval := COALESCE(rec_json->>'cust_id', rec_json->>'acct_id', rec_json->>'txn_id');
        payload := json_build_object(
          'op', TG_OP,
          'table', TG_TABLE_NAME,
          'key', keyval,
          'row', rec_json,
          'ts', (extract(epoch from now()) * 1000)::bigint
        );
        PERFORM pg_notify('cbs_cdc', payload::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    for (const tbl of ['customers', 'accounts', 'loans', 'cards', 'transactions']) {
      await client.query(`DROP TRIGGER IF EXISTS trg_${tbl}_cdc ON ${tbl};`);
      await client.query(`
        CREATE TRIGGER trg_${tbl}_cdc
        AFTER INSERT OR UPDATE OR DELETE ON ${tbl}
        FOR EACH ROW EXECUTE FUNCTION cbs_notify_change();
      `);
    }

    const { rows } = await client.query('SELECT count(*)::int AS c FROM customers');
    if (rows[0].c !== SCALE.customers) {
      console.log(
        `[pg] seeding ${SCALE.customers} customers, ~${SCALE.customers * 2} accounts, ` +
          `${SCALE.loans} loans, ${SCALE.cards} cards, ${SCALE.transactions} transactions…`
      );
      await bulkSeed(client);
      console.log('[pg] seed complete');
    }
  } finally {
    client.release();
  }
}

async function bulkSeed(client) {
  const t0 = Date.now();
  await client.query('TRUNCATE customers, accounts, loans, cards, transactions CASCADE');

  const customers = generateCustomers();
  await batchInsert(
    client,
    'customers',
    ['cust_id', 'name', 'segment', 'kyc', 'city', 'email', 'phone'],
    customers,
    1000
  );
  console.log(`  ✓ customers (${customers.length})`);

  const accounts = generateAccounts(customers);
  await batchInsert(
    client,
    'accounts',
    ['acct_id', 'cust_id', 'type', 'balance', 'currency'],
    accounts,
    1000
  );
  console.log(`  ✓ accounts (${accounts.length})`);

  const loans = generateLoans(customers);
  await batchInsert(
    client,
    'loans',
    ['loan_id', 'cust_id', 'product', 'principal', 'outstanding'],
    loans,
    1000
  );
  console.log(`  ✓ loans (${loans.length})`);

  const cards = generateCards(customers);
  await batchInsert(
    client,
    'cards',
    ['card_id', 'cust_id', 'type', 'limit', 'used'],
    cards,
    1000
  );
  console.log(`  ✓ cards (${cards.length})`);

  const txns = generateTransactions(accounts);
  await batchInsertTxns(client, txns, 2000);
  console.log(`  ✓ transactions (${txns.length})`);

  console.log(`  total seed time ${(Date.now() - t0) / 1000}s`);
}

async function batchInsert(client, table, cols, rows, batch) {
  const quoted = cols.map((c) => (c === 'limit' ? '"limit"' : c));
  await client.query('SET session_replication_role = replica');
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of slice) {
      const tuple = cols.map(() => '$' + p++).join(',');
      values.push(`(${tuple})`);
      for (const c of cols) params.push(r[c]);
    }
    await client.query(
      `INSERT INTO ${table} (${quoted.join(',')}) VALUES ${values.join(',')}`,
      params
    );
  }
  await client.query('SET session_replication_role = DEFAULT');
}

async function batchInsertTxns(client, rows, batch) {
  await client.query('SET session_replication_role = replica');
  const cols = ['txn_id', 'acct_id', 'type', 'amount', 'channel', 'narrative', 'ts'];
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of slice) {
      const tuple = cols.map(() => '$' + p++).join(',');
      values.push(`(${tuple})`);
      params.push(r.txn_id, r.acct_id, r.type, r.amount, r.channel, r.narrative, r.ts);
    }
    await client.query(`INSERT INTO transactions (${cols.join(',')}) VALUES ${values.join(',')}`, params);
  }
  await client.query('SET session_replication_role = DEFAULT');
}
