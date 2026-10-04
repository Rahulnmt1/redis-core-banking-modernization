import React, { useEffect, useState, useDeferredValue } from 'react';
import {
  Card,
  Pill,
  Button,
  SectionHeader,
  Code,
  Stat,
  RingGauge,
  Empty,
  Avatar,
  Bar,
} from '../components/ui.jsx';
import { CommandTrace } from '../components/QueryTrace.jsx';
import CustomerPicker from '../components/CustomerPicker.jsx';
import DemoGuide from '../components/DemoGuide.jsx';
import {
  KeyRound,
  RefreshCw,
  Send,
  Zap,
  Plug,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api.js';

const PARTNERS = [
  { id: 'acme-aggregator', label: 'Acme Aggregator', tone: 'lavender' },
  { id: 'fintech-payday', label: 'Fintech Payday', tone: 'mint' },
  { id: 'erp-globex', label: 'ERP Globex', tone: 'yellow' },
  { id: 'partner-bank-x', label: 'Partner Bank X', tone: 'red' },
];

export default function UC3OpenBanking({ events }) {
  const [state, setState] = useState({ access: [], refresh: [], consents: [] });
  const [partnerId, setPartnerId] = useState(PARTNERS[0].id);
  const [custId, setCustId] = useState('CUST000001');
  const [issued, setIssued] = useState(null);
  const [callRes, setCallRes] = useState(null);
  const [rate, setRate] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const deferredAction = useDeferredValue(lastAction);

  async function refresh() {
    setState(await api.get('/api/uc3/state'));
    setRate(await api.get(`/api/uc3/rate/${partnerId}`));
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    refresh();
  }, [partnerId, events.length]);

  async function issue() {
    const r = await api.post('/api/uc3/tokens', { partnerId, custId });
    setIssued(r);
    setLastAction({ kind: 'issue', ...r });
    refresh();
  }
  async function callApi() {
    const token = issued?.access_token || state.access[0]?.key.replace('oauth:access:', '');
    if (!token) return setCallRes({ ok: false, error: 'no_token' });
    const r = await api.post('/api/uc3/call', { partnerId, accessToken: token });
    setCallRes(r);
    setLastAction({ kind: 'call', ...r });
    refresh();
  }
  async function burst() {
    for (let i = 0; i < 35; i++) {
      callApi();
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  async function refreshAccess() {
    if (!issued?.refresh_token) return;
    const r = await api.post('/api/uc3/tokens/refresh', { refresh_token: issued.refresh_token });
    setIssued(r);
    setLastAction({ kind: 'refresh', ...r });
    refresh();
  }
  async function revokeConsent(id) {
    const r = await api.post(`/api/uc3/consent/${id}/revoke`);
    setLastAction({ kind: 'revoke', ...r });
    refresh();
  }

  const ratePct = rate ? Math.min(100, (rate.count / rate.limit) * 100) : 0;
  const gaugeTone = ratePct > 90 ? 'red' : ratePct > 60 ? 'yellow' : 'mint';

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={KeyRound}
        title="Open Banking, partner APIs & tokenized access"
        description="Redis sits behind the API gateway holding access/refresh tokens, consent state, rate-limit counters, and abuse signals. CBS data is exposed without pushing those controls into the core."
        badges={[
          { label: 'Hash + TTL', tone: 'red' },
          { label: 'INCR rate-limit', tone: 'yellow' },
        ]}
        outcomes={[
          'Expose CBS data and services to aggregators, fintechs, ERPs, merchants and payment initiators — without pushing those controls into the CBS itself',
        ]}
      />

      <DemoGuide
        badges={[{ label: 'INCR', tone: 'yellow' }, { label: 'Hash + TTL', tone: 'red' }]}
        overview={[
          'Access + refresh tokens stored as Redis Hashes with TTL — no DB join on every API call.',
          'Per-partner rate limit is a 60-second sliding window via INCR + EXPIRE.',
          'Consent revocation atomically blocks every token issued under it.',
        ]}
        steps={[
          { action: 'Pick a partner + customer, click Issue', expect: 'Access + refresh + consent created — trace shows 6 HSET/EXPIRE commands' },
          { action: 'Click Single call', expect: 'INCR rate, HGETALL token, HGETALL consent — trace shows 3 commands' },
          { action: 'Click Burst 35 (trigger limit)', expect: 'Gauge fills, calls flip to denied (rate_limited)' },
          { action: 'Click Use refresh', expect: 'New access token issued, trace shows fresh HSET / EXPIRE on rotated tokens' },
          { action: 'Click Revoke consent', expect: 'Subsequent calls fail with consent_revoked' },
        ]}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card title="Issue token" className="col-span-5" subtitle="OAuth-style flow stored in Redis">
          <div className="space-y-3">
            <div>
              <div className="tilt-tag text-redis-warm/45 mb-1.5 flex items-center gap-1.5">
                <Plug size={11} /> Partner
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PARTNERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPartnerId(p.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-all ${
                      partnerId === p.id
                        ? 'bg-redis-hyper/8 border-redis-hyper/40 text-redis-hyper'
                        : 'bg-white/[0.025] border-white/8 text-redis-warm/75 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          p.tone === 'red' ? 'bg-redis-hyper' :
                          p.tone === 'mint' ? 'bg-redis-mint' :
                          p.tone === 'yellow' ? 'bg-redis-yellow' :
                          'bg-redis-lavender'
                        }`}
                      />
                      <span className="truncate">{p.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="tilt-tag text-redis-warm/45 mb-1.5">Customer</div>
              <CustomerPicker value={custId} onChange={setCustId} height={150} />
            </div>
            <Button onClick={issue} className="w-full">
              <KeyRound size={12} /> Issue access + refresh tokens
            </Button>
            {issued && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-[11px] text-redis-warm/55">
                  <span>access_token</span>
                  <span className="code text-redis-mint">expires {issued.expires_in}s</span>
                </div>
                <Code className="!py-1.5 !text-[10.5px]">{issued.access_token}</Code>
                <div className="flex justify-between text-[11px] text-redis-warm/55">
                  <span>refresh_token</span>
                  <span className="code text-redis-mint">expires {issued.refresh_expires_in}s</span>
                </div>
                <Code className="!py-1.5 !text-[10.5px]">{issued.refresh_token}</Code>
                <div className="flex gap-1.5">
                  <Button tone="ghost" size="sm" onClick={refreshAccess}>
                    <RefreshCw size={11} /> Use refresh
                  </Button>
                  <Button tone="danger" size="sm" onClick={() => revokeConsent(issued.consent_id)}>
                    Revoke consent
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Rate limit · sliding window"
          className="col-span-7"
          subtitle={`${partnerId} · INCR rl:partner:* · 30 calls / 60s window`}
        >
          <div className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4 flex justify-center">
              <RingGauge
                value={rate?.count || 0}
                max={rate?.limit || 30}
                size={140}
                thickness={11}
                tone={gaugeTone}
                label={`${rate?.count ?? 0}/${rate?.limit ?? 30}`}
                sub="calls used"
              />
            </div>
            <div className="col-span-8 space-y-2">
              <Stat
                label="Remaining"
                value={Math.max(0, (rate?.limit ?? 30) - (rate?.count ?? 0))}
                tone="mint"
                hint={`Window resets in ${rate?.ttl ?? 0}s`}
                icon={ShieldCheck}
              />
              <div>
                <div className="flex justify-between text-[10.5px] text-redis-warm/45 mb-1">
                  <span>Window utilization</span>
                  <span className="code">{ratePct.toFixed(0)}%</span>
                </div>
                <Bar
                  value={ratePct}
                  max={100}
                  height={8}
                  color={ratePct > 90 ? '#FF4438' : ratePct > 60 ? '#FFE9A6' : '#80DBC4'}
                />
              </div>
              <div className="flex gap-1.5 pt-1">
                <Button onClick={callApi}>
                  <Send size={12} /> Single call
                </Button>
                <Button tone="soft" onClick={burst}>
                  <Zap size={12} /> Burst 35 (trigger limit)
                </Button>
              </div>
              {callRes && (
                <div
                  className={`rounded-lg p-2.5 text-[12px] fadein ${
                    callRes.ok
                      ? 'bg-redis-mint/8 border border-redis-mint/25'
                      : 'bg-redis-hyper/8 border border-redis-hyper/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Pill tone={callRes.ok ? 'mint' : 'red'} size="sm">
                      {callRes.ok ? 'allowed' : callRes.error}
                    </Pill>
                    <span className="code text-[10.5px] text-redis-warm/55">
                      count={callRes.count} · remaining={callRes.remaining}
                    </span>
                  </div>
                  {callRes.ok && (
                    <div className="text-[11px] text-redis-warm/65">
                      cust={callRes.custId} · scope=
                      <span className="code text-redis-mint">{callRes.scope}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card
          title="Active access tokens"
          className="col-span-4"
          subtitle={`${state.access.length} live · TTL countdown`}
        >
          <TokenList items={state.access} prefix="oauth:access:" tone="mint" />
        </Card>
        <Card
          title="Refresh tokens"
          className="col-span-4"
          subtitle={`${state.refresh.length} live · 1h TTL`}
        >
          <TokenList items={state.refresh} prefix="oauth:refresh:" tone="yellow" />
        </Card>
        <Card
          title="Consent records"
          className="col-span-4"
          subtitle={`${state.consents.length} consents · revocation flips status`}
        >
          {state.consents.length === 0 ? (
            <Empty icon={ShieldCheck} message="No consents yet" hint="Issue a token to create one" />
          ) : (
            <div className="space-y-1 max-h-56 overflow-auto custom-scroll">
              {state.consents.map((c) => (
                <div
                  key={c.key}
                  className="flex justify-between items-center px-2.5 py-2 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Avatar name={c.partnerId} segment="Retail" size={22} />
                    <div className="min-w-0">
                      <div className="text-[12px] text-redis-warm truncate">{c.partnerId}</div>
                      <div className="code text-[10px] text-redis-warm/45 truncate">
                        {c.custId} · {c.scope}
                      </div>
                    </div>
                  </div>
                  <Pill tone={c.status === 'ACTIVE' ? 'mint' : 'red'} size="sm">
                    {c.status}
                  </Pill>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Query trace · what actually ran"
        subtitle="Last action against the token store · commands + per-call timing"
      >
        <CommandTrace
          tone="red"
          label={
            deferredAction?.kind === 'issue'
              ? 'Issue tokens (Hash + EXPIRE)'
              : deferredAction?.kind === 'refresh'
                ? 'Refresh access (rotate Hash + EXPIRE)'
                : deferredAction?.kind === 'call'
                  ? deferredAction?.ok
                    ? 'Partner call (allowed)'
                    : `Partner call (${deferredAction?.error || 'denied'})`
                  : deferredAction?.kind === 'revoke'
                    ? 'Revoke consent (HSET status REVOKED)'
                    : 'Last action'
          }
          icon={Zap}
          note={
            deferredAction?.kind === 'issue'
              ? `partner=${partnerId}`
              : deferredAction?.kind === 'call'
                ? `count=${deferredAction.count}/${deferredAction.limit}`
                : ''
          }
          steps={deferredAction?.trace || []}
          totalLatency={deferredAction?.totalLatencyMs}
          output={
            deferredAction?.kind === 'issue' || deferredAction?.kind === 'refresh'
              ? {
                  access_token: deferredAction.access_token,
                  refresh_token: deferredAction.refresh_token,
                  consent_id: deferredAction.consent_id,
                  expires_in: deferredAction.expires_in,
                  refresh_expires_in: deferredAction.refresh_expires_in,
                }
              : deferredAction?.kind === 'call'
                ? {
                    ok: deferredAction.ok,
                    error: deferredAction.error,
                    custId: deferredAction.custId,
                    scope: deferredAction.scope,
                    count: deferredAction.count,
                    limit: deferredAction.limit,
                    remaining: deferredAction.remaining,
                  }
                : deferredAction?.kind === 'revoke'
                  ? { consentId: deferredAction.consentId, status: 'REVOKED' }
                  : undefined
          }
          emptyMessage="Click Issue / Single call / Refresh / Revoke to populate the trace"
        />
      </Card>
    </div>
  );
}

function TokenList({ items, prefix, tone }) {
  if (items.length === 0)
    return <Empty icon={KeyRound} message="No tokens" hint="Issue one to populate" />;
  return (
    <div className="space-y-1 max-h-56 overflow-auto custom-scroll">
      {items.map((t) => {
        const ttlPct = Math.min(100, (t.ttl / 300) * 100);
        return (
          <div
            key={t.key}
            className="px-2.5 py-2 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-redis-hyper/4 hover:border-redis-hyper/20"
          >
            <div className="flex justify-between items-center mb-1">
              <div className="min-w-0">
                <div className="code text-[11px] truncate text-redis-warm/85">
                  {t.key.replace(prefix, '').slice(0, 18)}…
                </div>
                <div className="text-[10px] text-redis-warm/45">{t.partnerId}</div>
              </div>
              <Pill tone={t.ttl > 60 ? 'mint' : 'yellow'} size="sm">
                {t.ttl}s
              </Pill>
            </div>
            <Bar
              value={ttlPct}
              max={100}
              height={3}
              color={
                tone === 'mint' ? '#80DBC4' : tone === 'yellow' ? '#FFE9A6' : '#FF4438'
              }
            />
          </div>
        );
      })}
    </div>
  );
}
