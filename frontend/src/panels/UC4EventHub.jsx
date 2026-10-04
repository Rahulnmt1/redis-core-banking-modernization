import React, { useEffect, useState, useDeferredValue } from 'react';
import {
  Card,
  Pill,
  Button,
  SectionHeader,
  Code,
  FlowDiagram,
  Stat,
  Empty,
} from '../components/ui.jsx';
import { CommandTrace, QueryTrace } from '../components/QueryTrace.jsx';
import DemoGuide from '../components/DemoGuide.jsx';
import {
  Workflow,
  Send,
  ArrowDownToLine,
  Activity,
  Cpu,
  Building2,
  Users,
  RadioTower,
} from 'lucide-react';
import { api } from '../lib/api.js';

const STREAMS = [
  { id: 'stream:cbs.transactions', label: 'CBS · transactions', tone: 'red' },
  { id: 'stream:payments.switch', label: 'Payments switch', tone: 'mint' },
  { id: 'stream:crm.events', label: 'CRM · events', tone: 'lavender' },
  { id: 'stream:notifications', label: 'Notifications', tone: 'yellow' },
];

const PRODUCERS = [
  {
    stream: 'stream:cbs.transactions',
    eventType: 'transaction.posted',
    label: 'CBS · transaction.posted',
    icon: Building2,
    tone: 'red',
  },
  {
    stream: 'stream:payments.switch',
    eventType: 'payment.received',
    label: 'Payments · payment.received',
    icon: RadioTower,
    tone: 'mint',
  },
  {
    stream: 'stream:crm.events',
    eventType: 'profile.updated',
    label: 'CRM · profile.updated',
    icon: Users,
    tone: 'lavender',
  },
];

export default function UC4EventHub({ events }) {
  const [state, setState] = useState({ list: {}, stats: {}, groups: [] });
  const [tail, setTail] = useState({});
  const [activeStream, setActiveStream] = useState(STREAMS[0].id);
  const [lastPublish, setLastPublish] = useState(null);
  const [lastConsume, setLastConsume] = useState(null);

  const deferredPublish = useDeferredValue(lastPublish);
  const deferredConsume = useDeferredValue(lastConsume);
  const deferredTail = useDeferredValue(tail[activeStream]);

  async function refresh() {
    const s = await api.get('/api/uc4/streams');
    setState(s);
    const t = await api.get(`/api/uc4/tail/${encodeURIComponent(activeStream)}`);
    setTail({ [activeStream]: t });
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [activeStream]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  async function publish(stream, eventType) {
    const r = await api.post('/api/uc4/publish', {
      stream,
      fields: {
        eventType,
        custId: 'CUST000001',
        amount: Math.floor(Math.random() * 10000),
        ts: Date.now(),
      },
    });
    setLastPublish(r);
    setActiveStream(stream);
    refresh();
  }

  async function consume(stream, group) {
    const r = await api.post('/api/uc4/consume', { stream, group, consumer: 'demo-1' });
    setLastConsume({ ...r, stream, group });
    refresh();
  }

  const tailEntries = tail[activeStream]?.entries || [];
  const totalLen = STREAMS.reduce((s, st) => s + (state.stats?.[st.id]?.length || 0), 0);
  const totalGroups = state.groups?.length || 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Workflow}
        title="Event-driven integration hub around the core"
        description="Redis Streams replace point-to-point integrations. Producers (CBS, payments switch, CRM) publish operational events; consumer groups (notifier, analytics, fraud) read independently with per-group cursors and acks."
        badges={[
          { label: 'XADD', tone: 'red' },
          { label: 'XREADGROUP', tone: 'red' },
        ]}
        outcomes={[
          'Instead of every consumer polling or tightly integrating with the CBS, Redis becomes the real-time event and state layer that fans out changes from CBS, payments switch, CRM, LOS, cards, AML and digital channels',
        ]}
      />

      <DemoGuide
        badges={[{ label: 'XADD', tone: 'red' }, { label: 'Consumer groups', tone: 'red' }]}
        overview={[
          'Producers (CBS, payments switch, CRM) publish events to dedicated Redis Streams.',
          'Independent consumer groups (notifier, analytics, fraud, recon, timeline) consume in parallel with their own cursor + pending list.',
          'Replaces a tangle of point-to-point integrations with one append-only log per topic.',
        ]}
        steps={[
          { action: 'Click each producer once', expect: 'Stream lengths increment + Publish trace shows the XADD command + new entry id + ms' },
          { action: 'Click on a stream tile', expect: 'Tail viewer + XREVRANGE trace + consumer groups load for it' },
          { action: 'Click Consume on a group', expect: 'XREADGROUP + XACK trace shows the entry consumed and acked' },
        ]}
      />

      <Card title="Topology" subtitle="Producers → Streams → Consumer groups">
        <FlowDiagram
          height={230}
          width={760}
          nodes={[
            { id: 'cbs', x: 10, y: 30, label: 'CBS' },
            { id: 'switch', x: 10, y: 95, label: 'Payments Sw' },
            { id: 'crm', x: 10, y: 160, label: 'CRM' },
            { id: 'sCBS', x: 220, y: 30, label: 'cbs.transactions', tone: 'redis' },
            { id: 'sSw', x: 220, y: 95, label: 'payments.switch', tone: 'redis' },
            { id: 'sCrm', x: 220, y: 160, label: 'crm.events', tone: 'redis' },
            { id: 'g1', x: 460, y: 5, label: 'g.notifier', tone: 'mint' },
            { id: 'g2', x: 460, y: 50, label: 'g.analytics', tone: 'mint' },
            { id: 'g3', x: 460, y: 95, label: 'g.fraud', tone: 'mint' },
            { id: 'g4', x: 460, y: 140, label: 'g.recon', tone: 'mint' },
            { id: 'g5', x: 460, y: 185, label: 'g.timeline', tone: 'mint' },
          ]}
          edges={[
            { from: 'cbs', to: 'sCBS', active: true, label: 'XADD' },
            { from: 'switch', to: 'sSw', active: true, label: 'XADD' },
            { from: 'crm', to: 'sCrm', active: true, label: 'XADD' },
            { from: 'sCBS', to: 'g1', active: true },
            { from: 'sCBS', to: 'g2', active: true },
            { from: 'sCBS', to: 'g3', active: true },
            { from: 'sSw', to: 'g4', active: true },
            { from: 'sCrm', to: 'g5', active: true },
          ]}
        />
      </Card>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Active streams" value={STREAMS.length} icon={RadioTower} tone="red" />
        <Stat label="Total events" value={totalLen.toLocaleString()} icon={Activity} tone="mint" />
        <Stat label="Consumer groups" value={totalGroups} icon={Cpu} tone="lavender" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card title="Producers" className="col-span-5" subtitle="Publish into a stream">
          <div className="space-y-1.5">
            {PRODUCERS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.stream}
                  onClick={() => publish(p.stream, p.eventType)}
                  className="w-full rounded-lg border border-white/8 bg-white/[0.025] hover:border-redis-hyper/30 hover:bg-redis-hyper/5 px-3 py-2.5 transition-all flex items-center gap-2.5 text-left"
                >
                  <span
                    className={`inline-flex w-8 h-8 rounded-md border items-center justify-center ${
                      p.tone === 'red'
                        ? 'bg-redis-hyper/12 border-redis-hyper/30 text-redis-hyper'
                        : p.tone === 'mint'
                          ? 'bg-redis-mint/10 border-redis-mint/25 text-redis-mint'
                          : 'bg-redis-lavender/10 border-redis-lavender/25 text-redis-lavender'
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-redis-warm">{p.label}</div>
                    <div className="text-[10px] text-redis-warm/45 code truncate">{p.stream}</div>
                  </div>
                  <Send size={13} className="text-redis-warm/55" />
                </button>
              );
            })}
            <Code className="!text-[10.5px] mt-2">
{`XADD stream:cbs.transactions *
  eventType transaction.posted
  custId CUST000001
  amount 4250
  ts 1779708...`}
            </Code>
          </div>
        </Card>

        <Card title="Streams" className="col-span-7" subtitle="Click to inspect tail + consumers">
          <div className="grid grid-cols-2 gap-2">
            {STREAMS.map((s) => {
              const len = state.stats?.[s.id]?.length ?? 0;
              const groups = state.groups?.filter((g) => g.stream === s.id) || [];
              const active = activeStream === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStream(s.id)}
                  className={`text-left rounded-xl p-3 border transition-all ${
                    active
                      ? 'bg-redis-hyper/8 border-redis-hyper/35 shadow-[0_0_0_1px_rgba(255,68,56,0.2)]'
                      : 'bg-white/[0.02] border-white/8 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div
                        className={`text-[12.5px] ${
                          active ? 'text-redis-hyper' : 'text-redis-warm'
                        }`}
                      >
                        {s.label}
                      </div>
                      <div className="code text-[10px] text-redis-warm/40 truncate mt-0.5">
                        {s.id}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-[20px] leading-none text-redis-warm">
                        {len.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-redis-warm/40 uppercase tracking-widest mt-1">
                        events
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {groups.map((g) => (
                      <Pill key={g.name} tone="mint" size="sm">
                        {g.name.replace('g.', '')} · {g.pending ?? 0}
                      </Pill>
                    ))}
                    {groups.length === 0 && (
                      <span className="text-[10px] text-redis-warm/40">no consumer groups</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <Card
        title={`Tail · ${activeStream}`}
        subtitle="Most recent entries (XREVRANGE) · pulls update on publish"
        right={
          <Pill tone="red" size="sm">
            <Activity size={10} /> live
          </Pill>
        }
        padded={false}
      >
        <div className="grid grid-cols-12 gap-0">
          <div className="col-span-7 max-h-72 overflow-auto custom-scroll border-r border-white/5">
            {tailEntries.length === 0 ? (
              <div className="px-5 py-8">
                <Empty icon={RadioTower} message="No entries yet" hint="Publish from the producers above" />
              </div>
            ) : (
              <table className="w-full text-[11.5px]">
                <thead className="tilt-tag text-redis-warm/40 sticky top-0 bg-[#08131c]/95 backdrop-blur">
                  <tr className="text-left">
                    <th className="py-2 px-4">stream id</th>
                    <th className="py-2 pr-4">fields</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {tailEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-redis-hyper/[0.05]">
                      <td className="py-2 px-4 code text-[10.5px] text-redis-mint whitespace-nowrap">
                        {e.id}
                      </td>
                      <td className="py-2 pr-4 code text-[10.5px] text-redis-warm/70">
                        {Object.entries(e.fields)
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <span key={k}>
                              <span className="text-redis-warm/40">{k}=</span>
                              <span className="text-redis-warm">{String(v)}</span>{' '}
                            </span>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="col-span-5 px-4 py-3">
            <div className="tilt-tag text-redis-warm/45 mb-2">Consumer groups</div>
            <div className="space-y-1.5">
              {state.groups
                ?.filter((g) => g.stream === activeStream)
                .map((g) => (
                  <div
                    key={g.name}
                    className="px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[12px] text-redis-warm">{g.name}</span>
                      <Pill tone={g.pending > 0 ? 'yellow' : 'mint'} size="sm">
                        pending {g.pending ?? 0}
                      </Pill>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] code text-redis-warm/45 truncate">
                        last {g['last-delivered-id'] || '0-0'}
                      </span>
                      <Button tone="ghost" size="sm" onClick={() => consume(activeStream, g.name)}>
                        <ArrowDownToLine size={11} /> Consume
                      </Button>
                    </div>
                  </div>
                ))}
              {(state.groups || []).filter((g) => g.stream === activeStream).length === 0 && (
                <div className="text-[11px] text-redis-warm/40">no consumer groups</div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Query trace · what actually ran"
        subtitle="Last publish + tail + consume calls against the streams"
      >
        <div className="grid grid-cols-3 gap-3">
          <QueryTrace
            tone="red"
            icon={Send}
            label="XADD (publish)"
            note={
              deferredPublish?.id
                ? `${deferredPublish.stream} → ${deferredPublish.id}`
                : 'click a producer'
            }
            latency={deferredPublish?.latencyMs}
            query={deferredPublish?.command || 'XADD <stream> * key value …'}
            output={
              deferredPublish
                ? { id: deferredPublish.id, stream: deferredPublish.stream, fields: deferredPublish.fields }
                : null
            }
            scrollMax="max-h-44"
            emptyMessage="No event published yet"
          />
          <QueryTrace
            tone="lavender"
            icon={ArrowDownToLine}
            label="XREVRANGE (tail)"
            note={`${activeStream}`}
            latency={deferredTail?.latencyMs}
            query={deferredTail?.command || `XREVRANGE ${activeStream} + - COUNT 20`}
            output={
              deferredTail?.entries?.length
                ? { count: deferredTail.entries.length, latest: deferredTail.entries.slice(0, 3) }
                : null
            }
            scrollMax="max-h-44"
            emptyMessage="Stream is empty"
          />
          <CommandTrace
            tone="mint"
            icon={Cpu}
            label="XREADGROUP + XACK"
            note={
              deferredConsume?.group
                ? `${deferredConsume.group} on ${deferredConsume.stream?.split(':').pop()}`
                : 'click Consume'
            }
            steps={deferredConsume?.trace || []}
            totalLatency={deferredConsume?.totalLatencyMs}
            output={
              deferredConsume?.id
                ? { id: deferredConsume.id, fields: deferredConsume.fields }
                : deferredConsume?.empty
                  ? { empty: true }
                  : undefined
            }
            emptyMessage="Click Consume on a group to populate"
          />
        </div>
      </Card>
    </div>
  );
}
