import React, { useEffect, useState, useDeferredValue } from 'react';
import {
  Card,
  Pill,
  Button,
  SectionHeader,
  Code,
  Stat,
  Input,
  FlowDiagram,
  Empty,
} from '../components/ui.jsx';
import { CommandTrace, QueryTrace } from '../components/QueryTrace.jsx';
import DemoGuide from '../components/DemoGuide.jsx';
import { Layers, Send, Zap, Database, Clock } from 'lucide-react';
import { api } from '../lib/api.js';

const DEFAULT_ACCT = 'ACC001001';

export default function UC5CQRS({ events }) {
  const [accts, setAccts] = useState([]);
  const [acctId, setAcctId] = useState(DEFAULT_ACCT);
  const [type, setType] = useState('CREDIT');
  const [amount, setAmount] = useState(1500);
  const [last, setLast] = useState(null);
  const [redisRes, setRedisRes] = useState(null);
  const [pgRes, setPgRes] = useState(null);
  const [readModels, setReadModels] = useState([]);

  const deferredRedis = useDeferredValue(redisRes);
  const deferredPg = useDeferredValue(pgRes);
  const deferredCmd = useDeferredValue(last);

  async function refreshList() {
    setAccts(await api.get('/api/uc5/accounts'));
    setReadModels(await api.get('/api/uc5/readmodels'));
  }
  function fetchBoth(id) {
    setRedisRes(null);
    setPgRes(null);
    api.get(`/api/uc5/redis/${id}`).then(setRedisRes).catch(() => {});
    api.get(`/api/uc5/postgres/${id}`).then(setPgRes).catch(() => {});
  }

  useEffect(() => {
    refreshList();
    fetchBoth(acctId);
    const t = setInterval(refreshList, 1500);
    const t2 = setInterval(() => fetchBoth(acctId), 1500);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [acctId]);
  useEffect(() => {
    refreshList();
    fetchBoth(acctId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  async function command() {
    const r = await api.post('/api/uc5/command', {
      acctId,
      type,
      amount: Number(amount),
      channel: 'API',
      narrative: 'Demo CQRS write',
    });
    setLast(r);
    refreshList();
    fetchBoth(acctId);
  }

  const speedup =
    deferredRedis?.latencyMs && deferredPg?.latencyMs
      ? Math.max(1, Math.round(deferredPg.latencyMs / deferredRedis.latencyMs))
      : null;

  const lag = last
    ? readModels.find((rm) => rm.acctId === last.acctId)?.lastUpdatedAt - last.ts
    : null;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Layers}
        title="CBS modernization with microservices & CQRS read models"
        description="Command side keeps writing to Postgres CBS. RDI propagates changes into Redis JSON read models. Query-side microservices read from Redis with sub-millisecond latency."
        badges={[
          { label: 'CQRS', tone: 'red' },
          { label: 'JSON read-model', tone: 'red' },
          { label: 'RDI', tone: 'lavender' },
        ]}
        outcomes={[
          'Modernize digital channels and microservices without rewriting the CBS',
          'Sub-millisecond reads for query-side services; writes still flow through the system of record',
          'Independent scaling — query side grows without adding load on the CBS',
          'Lower TCO and risk on legacy infrastructure',
        ]}
      />

      <DemoGuide
        badges={[{ label: 'CQRS', tone: 'red' }, { label: 'RDI lag', tone: 'lavender' }]}
        overview={[
          'Command side: writes still land on Postgres CBS — system of record stays the same.',
          'Read side: Redis JSON read-model holds account + balance + last txn for sub-ms reads.',
          'RDI catches the change via CDC and updates the read-model in ~10–30 ms.',
        ]}
        steps={[
          { action: 'Pick an account from the read-model grid', expect: 'Same record loads from both stores — Redis JSON.GET in ~1 ms, Postgres JOIN in ~10–20 ms' },
          { action: 'Set CREDIT/DEBIT + amount, click Post transaction', expect: 'Postgres balance updates immediately — trace shows BEGIN/UPDATE/INSERT/COMMIT' },
          { action: 'Watch the read-model panel', expect: 'New balance appears in Redis after RDI lag (10–30 ms)' },
          { action: 'Scroll to Query trace', expect: 'See the literal SELECT/JOIN vs JSON.GET that produced the displayed data' },
        ]}
      />

      <Card title="CQRS flow">
        <FlowDiagram
          height={170}
          width={760}
          nodes={[
            { id: 'cmd', x: 10, y: 60, label: 'Command API' },
            { id: 'pg', x: 165, y: 60, label: 'Postgres', sub: 'CBS write', tone: 'pg' },
            { id: 'rdi', x: 320, y: 60, label: 'RDI', sub: 'CDC', tone: 'rdi' },
            { id: 'redis', x: 470, y: 20, label: 'Redis JSON', sub: 'read model', tone: 'redis' },
            { id: 'stream', x: 470, y: 100, label: 'Streams', sub: 'fan-out', tone: 'redis' },
            { id: 'query', x: 620, y: 60, label: 'Query API', tone: 'mint' },
          ]}
          edges={[
            { from: 'cmd', to: 'pg', active: true, label: 'INSERT' },
            { from: 'pg', to: 'rdi', active: true },
            { from: 'rdi', to: 'redis', active: true, label: 'JSON.SET' },
            { from: 'rdi', to: 'stream', active: true, label: 'XADD' },
            { from: 'redis', to: 'query', active: true, label: 'JSON.GET' },
          ]}
        />
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card title="Command side" subtitle="Writes to Postgres CBS" className="col-span-5">
          <div className="space-y-3">
            <div>
              <label className="tilt-tag text-redis-warm/45 mb-1.5 block">Account</label>
              <div className="rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-2">
                <div className="code text-[12.5px] text-redis-warm">{acctId}</div>
                <div className="text-[10.5px] text-redis-warm/45 mt-0.5">
                  pick from read-model grid below to change
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="tilt-tag text-redis-warm/45 mb-1.5 block">Type</label>
                <div className="grid grid-cols-2 gap-1">
                  {['CREDIT', 'DEBIT'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`px-2 py-1.5 rounded-lg border text-[12px] transition-all ${
                        type === t
                          ? t === 'CREDIT'
                            ? 'bg-redis-mint/10 border-redis-mint/40 text-redis-mint'
                            : 'bg-redis-hyper/10 border-redis-hyper/40 text-redis-hyper'
                          : 'bg-white/[0.025] border-white/8 text-redis-warm/65'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="tilt-tag text-redis-warm/45 mb-1.5 block">Amount (₹)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <Button onClick={command} className="w-full">
              <Send size={13} /> Post transaction (writes to Postgres)
            </Button>
            {last && (
              <Code className="!py-2 !text-[10.5px]">
{`-- writeToCBS → ${last.txnId}
acct ${last.acctId} new balance ₹ ${last.newBalance}
RDI propagates to Redis in ~10–30 ms`}
              </Code>
            )}
          </div>
        </Card>

        <Card
          title={`Query side · ${acctId}`}
          subtitle="Live reads of the same record from both stores"
          className="col-span-7"
        >
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            <Stat
              label="Postgres"
              value={deferredPg ? `${deferredPg.latencyMs} ms` : '—'}
              hint="JOIN + LATERAL"
              tone="lavender"
              icon={Database}
            />
            <Stat
              label="Redis"
              value={deferredRedis ? `${deferredRedis.latencyMs} ms` : '—'}
              hint="JSON.GET"
              tone="mint"
              icon={Zap}
            />
            <Stat
              label="Speedup"
              value={speedup ? `${speedup}×` : '—'}
              tone="red"
              accent
              hint="single-shot"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ReadBlock
              tone="lavender"
              icon={Database}
              label="Postgres"
              note="JOIN LATERAL"
              data={deferredPg?.data}
            />
            <ReadBlock
              tone="red"
              icon={Zap}
              label="Redis read-model"
              note="JSON.GET"
              data={
                deferredRedis?.data
                  ? {
                      acctId: deferredRedis.data.acctId,
                      balance: deferredRedis.data.balance,
                      lastTxn: {
                        txnId: deferredRedis.data.lastTxnId,
                        type: deferredRedis.data.lastTxnType,
                        amount: deferredRedis.data.lastTxnAmount,
                      },
                    }
                  : null
              }
              highlight
              lag={lag != null && lag >= 0 && lag < 5000 ? lag : null}
            />
          </div>
        </Card>
      </div>

      <Card
        title="All read-model documents in Redis"
        subtitle={`${readModels.length} accounts hydrated · grows live as RDI mirrors Postgres`}
      >
        {readModels.length === 0 ? (
          <Empty
            icon={Layers}
            message="No read-models hydrated yet"
            hint="Post a transaction or trigger an RDI resync."
          />
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-72 overflow-auto custom-scroll pr-1">
            {readModels.slice(0, 60).map((rm) => {
              const isActive = rm.acctId === acctId;
              return (
                <button
                  key={rm.key}
                  onClick={() => setAcctId(rm.acctId)}
                  className={`rounded-xl p-2.5 text-left transition-all ${
                    isActive
                      ? 'bg-redis-hyper/8 border border-redis-hyper/35'
                      : 'bg-white/[0.025] border border-white/8 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="code text-[10.5px] text-redis-warm/85 truncate">
                      {rm.acctId}
                    </span>
                    <Pill tone={isActive ? 'red' : 'mint'} size="sm">
                      JSON
                    </Pill>
                  </div>
                  <div className={`code text-[14px] font-medium leading-tight ${isActive ? 'text-redis-hyper' : 'text-redis-mint'}`}>
                    ₹ {rm.balance?.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[9.5px] text-redis-warm/40 code mt-1 truncate">
                    {rm.lastTxnType || '—'} {rm.lastTxnAmount ? '· ' + rm.lastTxnAmount : ''}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Query trace · what actually ran"
        subtitle={`Live view of the queries that produced the read panels above for ${acctId}`}
      >
        <div className="grid grid-cols-2 gap-3">
          <QueryTrace
            tone="lavender"
            icon={Database}
            label="Postgres"
            note="2 SELECTs"
            latency={deferredPg?.latencyMs}
            ratio={speedup}
            ratioLabel={speedup ? `${speedup}× slower` : null}
            query={deferredPg?.command || 'SELECT … FROM accounts JOIN transactions …'}
            output={deferredPg?.data}
          />
          <QueryTrace
            tone="red"
            icon={Zap}
            label="Redis read-model"
            note="1 JSON.GET"
            highlight
            latency={deferredRedis?.latencyMs}
            ratio={speedup}
            ratioLabel={speedup ? `${speedup}× faster` : null}
            query={deferredRedis?.command || `JSON.GET readmodel:account:${acctId} $`}
            output={deferredRedis?.data}
          />
        </div>
      </Card>

      <Card
        title="Command trace · what the Post transaction actually wrote"
        subtitle="Sequence of SQL run in the CBS transaction · RDI fans the change to Redis after COMMIT"
      >
        <CommandTrace
          tone="lavender"
          icon={Database}
          label="Postgres CBS"
          note={
            deferredCmd?.txnId
              ? `txn ${deferredCmd.txnId} · acct ${deferredCmd.acctId} · new balance ₹ ${deferredCmd.newBalance?.toLocaleString('en-IN')}`
              : 'no command yet'
          }
          steps={deferredCmd?.trace || []}
          totalLatency={deferredCmd?.totalLatencyMs}
          output={
            deferredCmd
              ? {
                  txnId: deferredCmd.txnId,
                  acctId: deferredCmd.acctId,
                  newBalance: deferredCmd.newBalance,
                  ts: deferredCmd.ts,
                }
              : undefined
          }
          emptyMessage="Click Post transaction to populate the trace"
        />
      </Card>
    </div>
  );
}

function ReadBlock({ tone, icon: Icon, label, note, data, highlight, lag }) {
  return (
    <div
      className={`rounded-xl p-3 ${
        highlight
          ? 'bg-redis-hyper/[0.05] border border-redis-hyper/30'
          : 'bg-white/[0.025] border border-white/8'
      }`}
    >
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <Pill tone={tone} size="sm">
          <Icon size={11} /> {label}
        </Pill>
        <span className="text-[10.5px] text-redis-warm/45 code">{note}</span>
        {lag != null && (
          <Pill tone="mint" size="sm">
            <Clock size={10} /> RDI lag {lag} ms
          </Pill>
        )}
      </div>
      {!data ? (
        <div className="text-[12px] text-redis-warm/40">no data</div>
      ) : (
        <div className="space-y-1.5">
          <Row k="account" v={data.acctId} mono />
          <Row
            k="balance"
            v={data.balance != null ? `₹ ${Number(data.balance).toLocaleString('en-IN')}` : '—'}
            mono
            highlight={highlight}
          />
          <Row k="last txn id" v={data.lastTxn?.txnId || '—'} mono />
          <Row
            k="last txn"
            v={data.lastTxn ? `${data.lastTxn.type} ${data.lastTxn.amount}` : '—'}
          />
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono, highlight }) {
  return (
    <div className="flex justify-between text-[12.5px]">
      <span className="text-redis-warm/45">{k}</span>
      <span
        className={`${mono ? 'code' : ''} ${
          highlight ? 'text-redis-hyper' : 'text-redis-warm'
        } truncate ml-2`}
      >
        {v ?? '—'}
      </span>
    </div>
  );
}
