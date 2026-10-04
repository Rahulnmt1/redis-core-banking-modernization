import React, { useEffect, useState, useDeferredValue } from 'react';
import {
  Card,
  Pill,
  Button,
  SectionHeader,
  Code,
  FlowDiagram,
  Input,
  Stat,
  Avatar,
  Empty,
} from '../components/ui.jsx';
import CustomerPicker from '../components/CustomerPicker.jsx';
import DemoGuide from '../components/DemoGuide.jsx';
import Customer360View from '../components/Customer360View.jsx';
import { QueryTrace } from '../components/QueryTrace.jsx';
import { Users, Search, RefreshCw, Zap, Database, IndianRupee, CreditCard, Wallet, Building2 } from 'lucide-react';
import { api } from '../lib/api.js';

const DEFAULT_CUST = 'CUST000001';

export default function UC1Customer360() {
  const [selected, setSelected] = useState(DEFAULT_CUST);
  const [redisRes, setRedisRes] = useState(null);
  const [pgRes, setPgRes] = useState(null);
  const [searching, setSearching] = useState('');
  const [searchRes, setSearchRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const deferredRedisRes = useDeferredValue(redisRes);
  const deferredPgRes = useDeferredValue(pgRes);
  const traceStale =
    deferredRedisRes !== redisRes || deferredPgRes !== pgRes;

  useEffect(() => {
    api.get('/api/customers/stats').then(setStats).catch(() => {});
    fetchBoth(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fetchBoth(custId) {
    setLoading(true);
    setRedisRes(null);
    setPgRes(null);
    let pending = 2;
    const done = () => {
      if (--pending === 0) setLoading(false);
    };
    api
      .get(`/api/uc1/redis/${custId}`)
      .then((r) => setRedisRes(r))
      .catch(() => {})
      .finally(done);
    api
      .get(`/api/uc1/postgres/${custId}`)
      .then((c) => setPgRes(c))
      .catch(() => {})
      .finally(done);
  }

  function pickCustomer(id) {
    setSelected(id);
    fetchBoth(id);
  }

  async function syncOne() {
    await api.post(`/api/uc1/sync/${selected}`);
    fetchBoth(selected);
  }
  async function syncAll() {
    setSyncing(true);
    try {
      await api.post('/api/uc1/sync-all?max=1000');
      const fresh = await api.get('/api/customers/stats');
      setStats(fresh);
    } finally {
      setSyncing(false);
    }
  }

  async function doSearch(forceQ) {
    const q = (forceQ != null ? forceQ : searching).trim();
    if (!q) return;
    const r = await api.get(`/api/uc1/search?q=${encodeURIComponent(q)}`);
    setSearchRes(r);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Users}
        title="Real-time customer 360 & account aggregation"
        description="RDI streams Postgres CBS rows into a single Redis JSON document per customer. Channels read the unified profile in sub-millisecond time without fanning out into multiple core-banking tables."
        badges={[
          { label: 'JSON', tone: 'red' },
          { label: 'FT.SEARCH', tone: 'red' },
          { label: 'RDI · CDC', tone: 'lavender' },
        ]}
        outcomes={[
          'Faster mobile / web response times',
          'Lower CBS read pressure',
          'Better consistency across channels',
          'Easier rollout of customer-360 and personalization services',
        ]}
      />

      <DemoGuide
        badges={[{ label: 'JSON.GET', tone: 'red' }, { label: 'FT.SEARCH', tone: 'red' }]}
        overview={[
          'A single Redis JSON document per customer holds profile + accounts + loans + cards + recent txns.',
          'Postgres needs 5 separate SELECTs across CBS tables to assemble the same view.',
          'Same JSON is indexed by the Redis Query Engine — full-text + tag search across the whole base.',
        ]}
        steps={[
          { action: 'Pick a customer (or search "Sharma")', expect: 'Customer 360 panel renders profile, accounts, loans, cards, txns' },
          { action: 'Toggle Redis ↔ Postgres in the source bar', expect: 'Same data, different latency — Redis 1 JSON.GET vs Postgres 5 SELECTs' },
          { action: 'Scroll to Query trace', expect: 'See the actual SQL/Redis command + the JSON returned + the timing' },
          { action: 'Search "Mumbai" or "Wealth"', expect: 'FT.SEARCH hits across all cust360:* docs' },
          { action: 'Click any search hit', expect: 'Customer becomes the active selection' },
        ]}
      />

      {stats && (
        <div className="grid grid-cols-6 gap-2.5">
          <Stat label="Customers" value={fmt(stats.customers)} hint="postgres source" tone="lavender" icon={Users} />
          <Stat label="Accounts" value={fmt(stats.accounts)} hint="across products" tone="default" icon={Wallet} />
          <Stat label="Transactions" value={fmt(stats.transactions)} hint="indexed by acct/ts" tone="yellow" icon={IndianRupee} />
          <Stat label="Loans" value={fmt(stats.loans)} hint="home/auto/personal" tone="default" icon={Building2} />
          <Stat label="Cards" value={fmt(stats.cards)} hint="credit/debit/prepaid" tone="default" icon={CreditCard} />
          <Stat label="cust360 in Redis" value={fmt(stats.cust360Synced)} hint="JSON read-models" tone="red" icon={Zap} />
        </div>
      )}

      <Card title="Architecture" subtitle="Postgres → RDI (CDC) → Redis JSON · indexed via FT.CREATE">
        <FlowDiagram
          height={170}
          width={760}
          nodes={[
            { id: 'pg', x: 10, y: 60, label: 'Postgres', sub: 'CBS tables', tone: 'pg' },
            { id: 'rdi', x: 200, y: 60, label: 'RDI', sub: 'LISTEN/NOTIFY', tone: 'rdi' },
            { id: 'redis', x: 380, y: 60, label: 'Redis JSON', sub: 'cust360:*', tone: 'redis' },
            { id: 'mob', x: 580, y: 10, label: 'Mobile' },
            { id: 'web', x: 580, y: 60, label: 'Internet bk', tone: 'mint' },
            { id: 'cc', x: 580, y: 110, label: 'Contact ctr' },
          ]}
          edges={[
            { from: 'pg', to: 'rdi', active: true, label: 'CDC' },
            { from: 'rdi', to: 'redis', active: true, label: 'JSON.SET' },
            { from: 'redis', to: 'mob', active: true },
            { from: 'redis', to: 'web', active: true },
            { from: 'redis', to: 'cc', active: true },
          ]}
        />
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card
          title="Customer picker"
          subtitle={stats ? `Searchable index over ${fmt(stats.customers)} customers` : ''}
          className="col-span-5"
          right={
            <div className="flex gap-1.5">
              <Button tone="ghost" size="sm" onClick={syncOne}>
                <RefreshCw size={11} /> One
              </Button>
              <Button size="sm" onClick={syncAll} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync 1k'}
              </Button>
            </div>
          }
        >
          <CustomerPicker value={selected} onChange={pickCustomer} height={310} />
        </Card>

        <Card
          title={`Customer 360 · ${selected}`}
          subtitle="Live data, switch source between Redis (1 JSON.GET) and Postgres (5 SELECTs)"
          className="col-span-7"
          right={
            <Button
              tone="ghost"
              size="sm"
              onClick={() => fetchBoth(selected)}
              disabled={loading}
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              {loading ? 'querying…' : 'Re-run'}
            </Button>
          }
        >
          <Customer360View redis={redisRes} postgres={pgRes} />
        </Card>
      </div>

      <Card
        title="Query trace · what actually ran"
        subtitle={`Live view of the queries that produced the customer 360 above for ${selected}`}
        right={
          traceStale ? (
            <Pill tone="lavender" size="sm">
              <RefreshCw size={10} className="animate-spin" /> updating trace…
            </Pill>
          ) : null
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <QueryTrace
            tone="lavender"
            icon={Database}
            label="Postgres"
            note="5 sequential SELECTs"
            latency={deferredPgRes?.latencyMs}
            ratio={
              deferredRedisRes?.latencyMs && deferredPgRes?.latencyMs
                ? Math.max(1, Math.round(deferredPgRes.latencyMs / deferredRedisRes.latencyMs))
                : null
            }
            ratioLabel={
              deferredRedisRes?.latencyMs && deferredPgRes?.latencyMs
                ? `${Math.max(1, Math.round(deferredPgRes.latencyMs / deferredRedisRes.latencyMs))}× slower`
                : null
            }
            query={`SELECT * FROM customers WHERE cust_id = '${selected}';
SELECT * FROM accounts  WHERE cust_id = '${selected}';
SELECT * FROM loans     WHERE cust_id = '${selected}';
SELECT * FROM cards     WHERE cust_id = '${selected}';
SELECT t.* FROM transactions t
  JOIN accounts a USING (acct_id)
  WHERE a.cust_id = '${selected}'
  ORDER BY t.ts DESC LIMIT 5;`}
            output={deferredPgRes?.data}
          />
          <QueryTrace
            tone="red"
            icon={Zap}
            label="Redis Enterprise"
            note="1 JSON.GET"
            latency={deferredRedisRes?.latencyMs}
            ratio={
              deferredRedisRes?.latencyMs && deferredPgRes?.latencyMs
                ? Math.max(1, Math.round(deferredPgRes.latencyMs / deferredRedisRes.latencyMs))
                : null
            }
            ratioLabel={
              deferredRedisRes?.latencyMs && deferredPgRes?.latencyMs
                ? `${Math.max(1, Math.round(deferredPgRes.latencyMs / deferredRedisRes.latencyMs))}× faster`
                : null
            }
            highlight
            query={`JSON.GET cust360:${selected} $`}
            output={deferredRedisRes?.data}
          />
        </div>
      </Card>

      <Card
        title="Searchable index (FT.SEARCH on JSON)"
        subtitle="Same cust360:* JSON docs are also a live full-text + tag index — no separate Elasticsearch / Solr needed"
        right={
          searchRes?.latencyMs != null ? (
            <Pill tone="red" size="sm">
              <Zap size={10} /> {searchRes.latencyMs} ms · {searchRes.total} hits
            </Pill>
          ) : null
        }
      >
        <div className="flex gap-2">
          <Input
            placeholder="Try a name, city, or segment…"
            value={searching}
            onChange={(e) => setSearching(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <Button onClick={doSearch}>
            <Search size={13} /> Search
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="tilt-tag text-redis-warm/45 mr-1">Try:</span>
          {[
            { q: 'Sharma', label: 'Sharma', kind: 'name' },
            { q: 'Mumbai', label: 'Mumbai', kind: 'city tag' },
            { q: 'Priority', label: 'Priority', kind: 'segment tag' },
            { q: 'Wealth', label: 'Wealth', kind: 'segment tag' },
            { q: 'Bengaluru', label: 'Bengaluru', kind: 'city tag' },
          ].map((p) => (
            <button
              key={p.q}
              onClick={() => {
                setSearching(p.q);
                doSearch(p.q);
              }}
              className="px-2 py-1 rounded-full border border-white/8 bg-white/[0.025] hover:bg-redis-hyper/10 hover:border-redis-hyper/35 text-[11.5px] text-redis-warm/75 hover:text-redis-warm transition-all flex items-center gap-1.5"
            >
              <span>{p.label}</span>
              <span className="tilt-tag text-redis-warm/35">{p.kind}</span>
            </button>
          ))}
        </div>

        {!searchRes ? (
          <div className="mt-3">
            <Empty
              icon={Search}
              message="Run a query against the live FT index"
              hint="The same JSON powering channel reads is also a full-text + tag search index over the entire customer base."
            />
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-3 mt-3">
            <div className="col-span-7">
              <div className="flex items-center justify-between mb-2">
                <div className="tilt-tag text-redis-warm/45">
                  Hits · {searchRes.total} total · showing {searchRes.docs.length}
                </div>
                <span className="text-[10.5px] code text-redis-warm/40">click to load 360</span>
              </div>
              {searchRes.error ? (
                <Empty icon={Search} message="Search error" hint={searchRes.error} />
              ) : searchRes.docs.length === 0 ? (
                <Empty icon={Search} message="No matches" hint="Try a different keyword" />
              ) : (
                <div className="space-y-1 max-h-80 overflow-auto pr-1 custom-scroll">
                  {searchRes.docs.map((d) => (
                    <button
                      key={d.custId}
                      onClick={() => pickCustomer(d.custId)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/5 bg-black/20 hover:bg-redis-hyper/8 hover:border-redis-hyper/25 text-sm text-left transition-all"
                    >
                      <Avatar name={d.name} segment={d.segment} size={26} />
                      <div className="flex-1 min-w-0">
                        <div className="text-redis-warm truncate">{d.name}</div>
                        <div className="text-[10.5px] code text-redis-warm/45 truncate">
                          {d.custId} · {d.city}
                        </div>
                      </div>
                      <Pill
                        tone={d.segment === 'Wealth' ? 'lavender' : d.segment === 'Priority' ? 'yellow' : 'mint'}
                        size="sm"
                      >
                        {d.segment}
                      </Pill>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-5">
              <SearchTrace
                command={searchRes.command}
                latency={searchRes.latencyMs}
                output={{
                  total: searchRes.total,
                  returned: searchRes.docs.length,
                  docs: searchRes.docs,
                }}
              />
              <div className="mt-2.5">
                <div className="tilt-tag text-redis-warm/45 mb-1">Index definition</div>
                <Code>
{`FT.CREATE idx:cust360 ON JSON
  PREFIX 1 cust360:
  SCHEMA $.custId    AS custId    TAG
         $.name      AS name      TEXT WEIGHT 5
         $.segment   AS segment   TAG
         $.city      AS city      TAG
         $.totalRelationship
                     AS rel       NUMERIC SORTABLE`}
                </Code>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function fmt(n) {
  if (n == null) return '—';
  if (typeof n !== 'number') return String(n);
  return n.toLocaleString('en-IN');
}

function SearchTrace({ command, latency, output }) {
  return (
    <div className="rounded-xl p-3 border bg-redis-hyper/[0.05] border-redis-hyper/30">
      <div className="flex items-center gap-2 mb-2">
        <Pill tone="red" size="sm">
          <Zap size={11} /> Redis Enterprise
        </Pill>
        <span className="text-[10.5px] text-redis-warm/45 code">FT.SEARCH on JSON</span>
        <span className="ml-auto code text-[12px] text-redis-hyper">
          {latency != null ? `${latency} ms` : '—'}
        </span>
      </div>
      <div className="tilt-tag text-redis-warm/45 mb-1">Command</div>
      <Code>{command || '—'}</Code>
      <div className="tilt-tag text-redis-warm/45 mt-2.5 mb-1 flex items-center justify-between">
        <span>Output</span>
        {output && (
          <span className="text-[10px] code text-redis-warm/40 normal-case tracking-normal">
            {output.returned} of {output.total} hits
          </span>
        )}
      </div>
      {output ? (
        <div className="rounded-lg border border-white/8 bg-black/35 max-h-56 overflow-auto custom-scroll">
          <pre className="text-[11px] code text-redis-warm/85 p-3 leading-snug whitespace-pre">
{JSON.stringify(output, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/8 px-3 py-4 text-[11.5px] text-redis-warm/40 text-center">
          run a search to see hits
        </div>
      )}
    </div>
  );
}

