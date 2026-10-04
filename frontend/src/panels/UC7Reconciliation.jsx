import React, { useEffect, useState, useDeferredValue } from 'react';
import {
  Card,
  Pill,
  Button,
  SectionHeader,
  Stat,
  FlowDiagram,
  Code,
  RingGauge,
  Empty,
} from '../components/ui.jsx';
import { CommandTrace } from '../components/QueryTrace.jsx';
import DemoGuide from '../components/DemoGuide.jsx';
import {
  CheckCheck,
  Send,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Activity,
  ArrowDownToDot,
  Workflow,
} from 'lucide-react';
import { api } from '../lib/api.js';

export default function UC7Reconciliation({ events }) {
  const [stats, setStats] = useState(null);
  const [emitted, setEmitted] = useState([]);
  const [lastEmit, setLastEmit] = useState(null);
  const deferredEmit = useDeferredValue(lastEmit);

  async function refresh() {
    setStats(await api.get('/api/uc7/stats'));
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  async function emitOne() {
    const r = await api.post('/api/uc7/emit', {});
    setEmitted((e) => [r, ...e].slice(0, 20));
    setLastEmit(r);
  }
  async function emitMany(n) {
    for (let i = 0; i < n; i++) {
      emitOne();
      await new Promise((r) => setTimeout(r, 70));
    }
  }

  const recentEvents = events
    .filter((e) => e.type === 'uc7:matched' || e.type === 'uc7:exception')
    .slice(0, 25);

  const total = (stats?.matched ?? 0) + (stats?.exceptions ?? 0);
  const matchedRate = total > 0 ? Math.round((stats.matched / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={CheckCheck}
        title="Near-real-time reconciliation, reporting & analytics"
        description="The payments switch and CBS each emit a transaction event into Redis Streams. A reconciliation worker matches by reference id in memory and raises exceptions on mismatches or missing legs."
        badges={[
          { label: 'Streams', tone: 'red' },
          { label: 'In-memory match', tone: 'red' },
        ]}
        outcomes={[
          'Banks speed up reconciliation between payment systems and the core by using Redis Data Integration (RDI) and Streams to load data in real time rather than waiting for slow batch processes — reducing the lag between transaction creation and operational visibility',
        ]}
      />

      <DemoGuide
        badges={[{ label: 'Streams', tone: 'red' }, { label: 'In-memory match', tone: 'red' }]}
        overview={[
          'Switch leg + CBS leg both flow into Redis Streams in real time.',
          'A matcher worker pairs them on ref-id in memory — replaces overnight batch recon.',
          '15% of CBS legs are dropped + 10% have amount drift to make exceptions visible.',
        ]}
        steps={[
          { action: 'Click Emit 1 switch txn', expect: 'Trace shows XADD + HSET + EXPIRE + ZADD for the switch leg' },
          { action: 'Wait ~1 second', expect: 'A simulated CBS leg arrives → matched count increments' },
          { action: 'Click Burst 100', expect: 'Match-rate gauge climbs, exceptions surface' },
          { action: 'Watch Live decisions list', expect: 'Matched (mint) + exception (red) entries appear' },
          { action: 'Scroll to Query trace', expect: 'See the literal command list emitted for the latest switch leg' },
        ]}
      />

      <Card title="Architecture" subtitle="Two streams · in-memory matcher · live exceptions">
        <FlowDiagram
          height={170}
          width={760}
          nodes={[
            { id: 'sw', x: 10, y: 30, label: 'Payments Sw' },
            { id: 'cbs', x: 10, y: 110, label: 'Postgres CBS', tone: 'pg' },
            { id: 's1', x: 200, y: 30, label: 'payments.switch', tone: 'redis' },
            { id: 's2', x: 200, y: 110, label: 'cbs.transactions', tone: 'redis' },
            { id: 'm', x: 400, y: 70, label: 'Matcher', sub: 'Redis HSET', tone: 'mint' },
            { id: 'ok', x: 590, y: 30, label: 'Matched', tone: 'mint' },
            { id: 'ex', x: 590, y: 110, label: 'Exceptions' },
          ]}
          edges={[
            { from: 'sw', to: 's1', active: true },
            { from: 'cbs', to: 's2', active: true, label: 'RDI' },
            { from: 's1', to: 'm', active: true, label: 'XADD' },
            { from: 's2', to: 'm', active: true, label: 'XADD' },
            { from: 'm', to: 'ok', active: true },
            { from: 'm', to: 'ex', active: true },
          ]}
        />
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card title="Generate switch traffic" className="col-span-5" subtitle="Drives both streams">
          <div className="space-y-2">
            <Button onClick={emitOne} className="w-full">
              <Send size={13} /> Emit 1 switch txn
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button tone="soft" onClick={() => emitMany(20)}>
                <Zap size={13} /> Burst 20
              </Button>
              <Button tone="soft" onClick={() => emitMany(100)}>
                <Zap size={13} /> Burst 100
              </Button>
            </div>
            <Code className="!py-2 !text-[10.5px]">
{`# Each emit produces:
XADD stream:payments.switch *
  refId REF... amount X side switch

# A simulated CBS-side leg is
# published 200–800 ms later.
# 15% are dropped, 10% have drift.`}
            </Code>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <div className="tilt-tag text-redis-warm/45 mb-1.5 flex items-center gap-1.5">
                <ArrowDownToDot size={11} /> Recent emits
              </div>
              {emitted.length === 0 ? (
                <div className="text-[11px] text-redis-warm/40 py-1.5">none yet</div>
              ) : (
                <div className="space-y-0.5 max-h-28 overflow-auto custom-scroll">
                  {emitted.map((e) => (
                    <div key={e.refId} className="code text-[10.5px] text-redis-warm/65">
                      {e.refId} · ₹ {e.amount} · {e.channel}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Live recon stats" className="col-span-7" subtitle="Updated as both legs land">
          <div className="grid grid-cols-12 gap-3 items-center">
            <div className="col-span-4 flex justify-center">
              <RingGauge
                value={matchedRate}
                max={100}
                size={140}
                thickness={11}
                tone={matchedRate >= 95 ? 'mint' : matchedRate >= 75 ? 'yellow' : 'red'}
                label={`${matchedRate}%`}
                sub="match rate"
              />
            </div>
            <div className="col-span-8 grid grid-cols-2 gap-2">
              <Stat label="Matched" value={stats?.matched ?? 0} tone="mint" icon={CheckCircle2} hint="both legs paired" />
              <Stat label="Exceptions" value={stats?.exceptions ?? 0} tone="red" icon={AlertTriangle} hint="amount drift / missing" />
              <Stat
                label="Pending switch"
                value={stats?.pendingSwitch ?? 0}
                tone="yellow"
                icon={Hourglass}
                hint="awaiting CBS leg"
              />
              <Stat
                label="Pending CBS"
                value={stats?.pendingCBS ?? 0}
                tone="lavender"
                icon={Hourglass}
                hint="awaiting switch leg"
              />
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between text-[10.5px] text-redis-warm/45 mb-1.5">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={10} /> Recent exceptions
              </span>
              <span className="code">{(stats?.recentExceptions || []).length}</span>
            </div>
            {(!stats?.recentExceptions || stats.recentExceptions.length === 0) ? (
              <div className="text-[11px] text-redis-warm/40 text-center py-2">none yet</div>
            ) : (
              <div className="space-y-0.5 max-h-28 overflow-auto custom-scroll">
                {stats.recentExceptions.map((e) => (
                  <div key={e.id} className="flex justify-between code text-[10.5px]">
                    <span className="text-redis-warm/75 truncate">{e.refId}</span>
                    <span className="text-redis-hyper">
                      sw {e.switchAmount} ↔ cbs {e.cbsAmount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Live decisions"
        subtitle="As soon as both legs arrive, decision is logged"
        right={
          <Pill tone="red" size="sm">
            <Activity size={10} /> live
          </Pill>
        }
        padded={false}
      >
        {recentEvents.length === 0 ? (
          <div className="px-5 py-6">
            <Empty
              icon={CheckCheck}
              message="No decisions yet"
              hint="Emit some switch traffic to trigger reconciliation."
            />
          </div>
        ) : (
          <div className="max-h-72 overflow-auto custom-scroll">
            {recentEvents.map((e, i) => {
              const matched = e.type === 'uc7:matched';
              return (
                <div
                  key={i}
                  className={`flex justify-between items-center px-4 py-2 border-b border-white/[0.04] last:border-0 transition fadein ${
                    matched
                      ? 'hover:bg-redis-mint/[0.05]'
                      : 'hover:bg-redis-hyper/[0.05]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {matched ? (
                      <Pill tone="mint" size="sm">
                        <CheckCircle2 size={10} /> matched
                      </Pill>
                    ) : (
                      <Pill tone="red" size="sm">
                        <AlertTriangle size={10} /> {e.data.kind || 'exception'}
                      </Pill>
                    )}
                    <span className="code text-[11px] text-redis-warm/85 truncate">
                      {e.data.refId}
                    </span>
                  </div>
                  <span className="code text-[10.5px] text-redis-warm/55">
                    {matched
                      ? `₹ ${e.data.amount}`
                      : e.data.switchAmount
                        ? `sw ${e.data.switchAmount} ↔ cbs ${e.data.cbsAmount}`
                        : 'no_cbs_record'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Query trace · what actually ran"
        subtitle="Last switch-leg emit · the literal Redis commands that get executed per transaction"
      >
        <CommandTrace
          tone="red"
          icon={Workflow}
          label="Switch leg → Redis"
          note={
            deferredEmit?.refId
              ? `${deferredEmit.refId} · ₹${deferredEmit.amount} · ${deferredEmit.channel}`
              : 'click Emit 1 switch txn'
          }
          steps={deferredEmit?.trace || []}
          totalLatency={deferredEmit?.totalLatencyMs}
          output={
            deferredEmit
              ? {
                  refId: deferredEmit.refId,
                  txnId: deferredEmit.txnId,
                  amount: deferredEmit.amount,
                  beneficiary: deferredEmit.beneficiary,
                  channel: deferredEmit.channel,
                  side: 'switch',
                  ts: deferredEmit.ts,
                }
              : undefined
          }
          emptyMessage="Click Emit 1 switch txn (or Burst) to populate"
        />
      </Card>
    </div>
  );
}
