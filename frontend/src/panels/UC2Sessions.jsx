import React, { useEffect, useState, useDeferredValue } from 'react';
import {
  Card,
  Pill,
  Button,
  SectionHeader,
  Stat,
  Code,
  Bar,
  Empty,
  Avatar,
} from '../components/ui.jsx';
import { CommandTrace, QueryTrace } from '../components/QueryTrace.jsx';
import CustomerPicker from '../components/CustomerPicker.jsx';
import DemoGuide from '../components/DemoGuide.jsx';
import {
  Smartphone,
  Globe,
  Building2,
  Banknote,
  ShieldCheck,
  X,
  RefreshCw,
  Activity,
  AlertTriangle,
  Clock,
  Users,
  Zap,
  Eye,
} from 'lucide-react';
import { api } from '../lib/api.js';

const CHANNELS = [
  { id: 'MOBILE', label: 'Mobile', icon: Smartphone, tone: 'red' },
  { id: 'WEB', label: 'Web', icon: Globe, tone: 'mint' },
  { id: 'BRANCH', label: 'Branch', icon: Building2, tone: 'yellow' },
  { id: 'ATM', label: 'ATM', icon: Banknote, tone: 'lavender' },
];

export default function UC2Sessions({ events }) {
  const [sessions, setSessions] = useState([]);
  const [custId, setCustId] = useState('CUST000001');
  const [, force] = useState(0);
  const [lastAction, setLastAction] = useState(null);
  const [readTrace, setReadTrace] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const deferredLastAction = useDeferredValue(lastAction);
  const deferredReadTrace = useDeferredValue(readTrace);

  async function refresh() {
    setSessions(await api.get('/api/uc2/sessions'));
  }
  useEffect(() => {
    refresh();
    const t = setInterval(() => force((x) => x + 1), 1000);
    const t2 = setInterval(refresh, 2500);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, []);
  useEffect(() => {
    refresh();
  }, [events.length]);

  async function login(channel) {
    const r = await api.post('/api/uc2/sessions', {
      custId,
      channel,
      device: channel === 'MOBILE' ? 'iPhone-15' : channel === 'WEB' ? 'Chrome-mac' : channel,
      mfa: false,
    });
    setLastAction({ kind: 'create', channel, ...r });
    setSelectedSessionId(r.id);
    refresh();
    pickRead(r.id);
  }

  async function touch(id) {
    const r = await api.post(`/api/uc2/sessions/${id}/touch`);
    setLastAction({ kind: 'touch', ...r });
    setSelectedSessionId(id);
    refresh();
    pickRead(id);
  }
  async function mfa(id) {
    const r = await api.post(`/api/uc2/sessions/${id}/mfa`);
    setLastAction({ kind: 'mfa', ...r });
    setSelectedSessionId(id);
    refresh();
    pickRead(id);
  }
  async function revoke(id) {
    const r = await api.del(`/api/uc2/sessions/${id}`);
    setLastAction({ kind: 'revoke', ...r });
    setReadTrace(null);
    setSelectedSessionId(null);
    refresh();
  }
  async function pickRead(id) {
    if (!id) return;
    setSelectedSessionId(id);
    const r = await api.get(`/api/uc2/sessions/${id}`);
    setReadTrace(r);
  }

  const byChannel = CHANNELS.map((c) => ({
    ...c,
    count: sessions.filter((s) => s.channel === c.id).length,
  }));

  const lastActionTitle = {
    create: 'Login (HSET + EXPIRE + SADD)',
    touch: 'Touch (HSET lastSeenAt + EXPIRE)',
    mfa: 'Complete MFA (HSET mfaState=PASSED)',
    revoke: 'Revoke (DEL session:<id>)',
  }[deferredLastAction?.kind];

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={Smartphone}
        title="Omnichannel session, profile & auth state"
        description="Redis Hashes hold session, MFA, device fingerprint, consent and risk signals — sub-millisecond reads, automatic TTL, and shared state across mobile, web, branch and ATM."
        badges={[
          { label: 'Hash', tone: 'red' },
          { label: 'TTL', tone: 'yellow' },
        ]}
        outcomes={[
          'Seamless handoff between channels',
          'Fast login and post-login dashboard load',
          'Reduced repeat-authentication friction',
          'Consistent risk-aware session enforcement across all channels',
        ]}
      />

      <DemoGuide
        badges={[{ label: 'HSET / HGETALL', tone: 'red' }, { label: 'EXPIRE', tone: 'yellow' }]}
        overview={[
          'Sessions live in Redis Hashes with native TTL — no cron, no cleanup batch.',
          'The same session is shared across Mobile, Web, Branch and ATM channels.',
          'MFA flips a single field; revoke deletes the key. State follows the customer.',
        ]}
        steps={[
          { action: 'Pick a customer in the picker', expect: 'Customer locked in for the next login' },
          { action: 'Click Mobile login (or Web/ATM)', expect: 'New row + 5-min TTL bar; trace shows HSET + EXPIRE + SADD' },
          { action: 'Click Eye on a session row', expect: 'HGETALL trace + the JSON it returned' },
          { action: 'Click MFA on a pending session', expect: 'mfaState flips PENDING → PASSED, riskScore 12 → 4' },
          { action: 'Click touch / revoke on a session', expect: 'TTL resets / DEL — trace updates with timing' },
        ]}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card title="Spawn a session" className="col-span-5" subtitle="Customer · channel · MFA later">
          <div className="space-y-3">
            <div>
              <div className="tilt-tag text-redis-warm/45 mb-1.5 flex items-center gap-1.5">
                <Users size={11} /> Customer
              </div>
              <CustomerPicker value={custId} onChange={setCustId} height={180} />
            </div>
            <div>
              <div className="tilt-tag text-redis-warm/45 mb-1.5">Login channel</div>
              <div className="grid grid-cols-2 gap-1.5">
                {CHANNELS.map(({ id, label, icon: Icon, tone }) => (
                  <button
                    key={id}
                    onClick={() => login(id)}
                    className="rounded-lg border border-white/8 bg-white/[0.025] hover:border-redis-hyper/35 hover:bg-redis-hyper/8 px-2.5 py-2 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md border ${
                        tone === 'red' ? 'bg-redis-hyper/12 border-redis-hyper/30 text-redis-hyper' :
                        tone === 'mint' ? 'bg-redis-mint/10 border-redis-mint/25 text-redis-mint' :
                        tone === 'yellow' ? 'bg-redis-yellow/10 border-redis-yellow/25 text-redis-yellow' :
                        'bg-redis-lavender/10 border-redis-lavender/25 text-redis-lavender'
                      }`}>
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12.5px] text-redis-warm">{label}</div>
                        <div className="text-[10px] text-redis-warm/40">login + 5min TTL</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <Code className="!text-[10.5px]">
{`HSET session:<id>
  custId ${custId}
  channel <CH>
  mfaState PENDING
  riskScore 12
  consentVersion v3.1
EXPIRE session:<id> 300
SADD sessions:byCust:${custId} <id>`}
            </Code>
          </div>
        </Card>

        <div className="col-span-7 space-y-3">
          <Card title="Channel split" subtitle="Live concurrent sessions" padded={false}>
            <div className="grid grid-cols-4 divide-x divide-white/5">
              {byChannel.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.id} className="px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-md border ${
                          c.tone === 'red'
                            ? 'bg-redis-hyper/12 border-redis-hyper/30 text-redis-hyper'
                            : c.tone === 'mint'
                              ? 'bg-redis-mint/10 border-redis-mint/25 text-redis-mint'
                              : c.tone === 'yellow'
                                ? 'bg-redis-yellow/10 border-redis-yellow/25 text-redis-yellow'
                                : 'bg-redis-lavender/10 border-redis-lavender/25 text-redis-lavender'
                        }`}
                      >
                        <Icon size={12} />
                      </span>
                      <span className="tilt-tag text-redis-warm/55">{c.label}</span>
                    </div>
                    <div className="font-display text-[26px] text-redis-warm leading-none">
                      {c.count}
                    </div>
                    <div className="text-[10px] text-redis-warm/35 code mt-1">
                      sessions · ttl 5m
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat label="Total active" value={sessions.length} tone="red" icon={Activity} />
            <Stat
              label="MFA passed"
              value={sessions.filter((s) => s.mfaState === 'PASSED').length}
              tone="mint"
              icon={ShieldCheck}
              hint="risk-cleared"
            />
            <Stat
              label="High risk"
              value={sessions.filter((s) => Number(s.riskScore) > 50).length}
              tone="yellow"
              icon={AlertTriangle}
              hint="risk-score > 50"
            />
          </div>
        </div>
      </div>

      <Card
        title="Active sessions"
        subtitle="TTL counts down in real time · touch resets, MFA flips state, revoke deletes"
        right={
          <Button tone="ghost" size="sm" onClick={refresh}>
            <RefreshCw size={11} /> Refresh
          </Button>
        }
        padded={false}
      >
        {sessions.length === 0 ? (
          <div className="px-5 py-2">
            <Empty
              icon={Smartphone}
              message="No active sessions"
              hint="Pick a customer above and click a channel to spawn one."
            />
          </div>
        ) : (
          <div className="overflow-auto max-h-[440px]">
            <table className="w-full text-[12.5px]">
              <thead className="tilt-tag text-redis-warm/40 sticky top-0 bg-[#08131c]/95 backdrop-blur">
                <tr className="text-left">
                  <th className="py-2.5 px-4">Session</th>
                  <th>Channel</th>
                  <th>Device</th>
                  <th>MFA</th>
                  <th>Risk</th>
                  <th>TTL</th>
                  <th className="text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sessions.map((s) => {
                  const ch = CHANNELS.find((c) => c.id === s.channel);
                  const Icon = ch?.icon || Smartphone;
                  const isSelected = s.sessionId === selectedSessionId;
                  return (
                    <tr
                      key={s.sessionId}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-redis-hyper/[0.06]'
                          : 'hover:bg-redis-hyper/[0.04]'
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={s.custId} segment="Retail" size={26} />
                          <div className="min-w-0">
                            <div className="text-redis-warm code text-[11px] truncate">
                              {s.sessionId.slice(0, 12)}…
                            </div>
                            <div className="text-[10.5px] text-redis-warm/45 code">{s.custId}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Pill tone={ch?.tone || 'slate'} size="sm">
                          <Icon size={10} /> {s.channel}
                        </Pill>
                      </td>
                      <td className="text-redis-warm/65">{s.device}</td>
                      <td>
                        {s.mfaState === 'PASSED' ? (
                          <Pill tone="mint" size="sm">
                            <ShieldCheck size={10} /> passed
                          </Pill>
                        ) : (
                          <Pill tone="yellow" size="sm">
                            pending
                          </Pill>
                        )}
                      </td>
                      <td>
                        <Pill
                          tone={Number(s.riskScore) > 50 ? 'red' : 'mint'}
                          size="sm"
                        >
                          {s.riskScore}
                        </Pill>
                      </td>
                      <td className="pr-4 w-40">
                        <TtlBar ttl={s.ttl} />
                      </td>
                      <td className="pr-4">
                        <div className="flex gap-1 justify-end">
                          <Button tone="ghost" size="sm" onClick={() => pickRead(s.sessionId)}>
                            <Eye size={10} />
                          </Button>
                          <Button tone="ghost" size="sm" onClick={() => touch(s.sessionId)}>
                            <Clock size={10} /> touch
                          </Button>
                          {s.mfaState !== 'PASSED' && (
                            <Button size="sm" onClick={() => mfa(s.sessionId)}>
                              MFA
                            </Button>
                          )}
                          <Button tone="danger" size="sm" onClick={() => revoke(s.sessionId)}>
                            <X size={10} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Query trace · what actually ran"
        subtitle="Last action against the session store · commands + per-call timing + Redis output"
      >
        <div className="grid grid-cols-2 gap-3">
          <CommandTrace
            tone="red"
            label={lastActionTitle || 'Last action'}
            icon={Zap}
            note={
              deferredLastAction?.id
                ? `session:${deferredLastAction.id.slice(0, 8)}…`
                : 'no action yet'
            }
            steps={deferredLastAction?.trace || []}
            output={deferredLastAction?.output}
            totalLatency={deferredLastAction?.totalLatencyMs}
            emptyMessage="Click a channel button to login and watch the commands run"
          />
          <QueryTrace
            tone="lavender"
            icon={Eye}
            label="HGETALL trace"
            note={
              deferredReadTrace?.id
                ? deferredReadTrace.found
                  ? `read session:${deferredReadTrace.id.slice(0, 8)}…`
                  : `session:${deferredReadTrace.id.slice(0, 8)} (not found)`
                : 'click Eye on a session row'
            }
            latency={deferredReadTrace?.totalLatencyMs}
            query={
              deferredReadTrace?.id
                ? `HGETALL session:${deferredReadTrace.id}\nTTL session:${deferredReadTrace.id}`
                : 'HGETALL session:<id>\nTTL session:<id>'
            }
            output={deferredReadTrace?.output}
            emptyMessage="No session inspected yet — pick one from the list"
            scrollMax="max-h-44"
          />
        </div>
      </Card>
    </div>
  );
}

function TtlBar({ ttl }) {
  const max = 300;
  const pct = Math.max(0, Math.min(100, (ttl / max) * 100));
  const color = ttl < 60 ? '#FF4438' : ttl < 150 ? '#FFE9A6' : '#80DBC4';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 max-w-24">
        <Bar value={pct} max={100} color={color} height={5} />
      </div>
      <span className="text-[11px] code text-redis-warm/55 w-9 text-right">{ttl}s</span>
    </div>
  );
}
