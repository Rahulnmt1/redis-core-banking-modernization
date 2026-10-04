import React, { useEffect, useState, useDeferredValue } from 'react';
import {
  Card,
  Pill,
  Button,
  SectionHeader,
  Stat,
  Input,
  RingGauge,
  Empty,
  Avatar,
} from '../components/ui.jsx';
import { CommandTrace } from '../components/QueryTrace.jsx';
import CustomerPicker from '../components/CustomerPicker.jsx';
import DemoGuide from '../components/DemoGuide.jsx';
import {
  ShieldAlert,
  Send,
  Plus,
  X,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Eye,
  ListChecks,
  Activity,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api.js';

const DECISION_TONES = {
  BLOCK: { tone: 'red', icon: Ban, color: '#FF4438' },
  REVIEW: { tone: 'yellow', icon: Eye, color: '#FFE9A6' },
  APPROVE: { tone: 'mint', icon: ShieldCheck, color: '#80DBC4' },
};

export default function UC6Fraud({ events }) {
  const [custId, setCustId] = useState('CUST000001');
  const [state, setState] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [amount, setAmount] = useState(5000);
  const [bene, setBene] = useState('BENE-1234');
  const [last, setLast] = useState(null);
  const [newWatch, setNewWatch] = useState('');
  const deferredLast = useDeferredValue(last);

  async function refresh() {
    setState(await api.get(`/api/uc6/state/${custId}`));
    setDecisions(await api.get('/api/uc6/decisions'));
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [custId]);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  async function check() {
    const r = await api.post('/api/uc6/check', {
      txnId: 'TX' + Math.floor(Math.random() * 1_000_000),
      custId,
      amount: Number(amount),
      beneficiary: bene,
    });
    setLast(r);
    refresh();
  }
  async function burst() {
    for (let i = 0; i < 8; i++) {
      check();
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  async function addWatch() {
    if (!newWatch) return;
    await api.post('/api/uc6/watchlist/add', { member: newWatch });
    setNewWatch('');
    refresh();
  }
  async function removeWatch(m) {
    await api.post('/api/uc6/watchlist/remove', { member: m });
    refresh();
  }

  const limits = state?.limits || { perTxn: 0, daily: 0, maxVelPerMin: 0 };
  const counters = state?.counters || { '1m': 0, '1h': 0, '24h': 0 };
  const velPct = limits.maxVelPerMin
    ? Math.min(100, (counters['1m'] / limits.maxVelPerMin) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        icon={ShieldAlert}
        title="Real-time fraud, transaction limits & dedupe"
        description="Velocity counters (INCR + EXPIRE), per-customer limits, watchlist sets, recent-transaction dedupe, and a decision log — all backed by Redis."
        badges={[
          { label: 'INCR + EXPIRE', tone: 'red' },
          { label: 'SET / SISMEMBER', tone: 'red' },
        ]}
        outcomes={[
          'Single-digit-millisecond fraud decisions, in line with payment authorization SLAs',
          'Lower fraud losses through real-time velocity, watchlist and dedupe checks',
          'Tunable rules without core deployment cycles',
          'Full auditable decision log with no batch DB pressure',
        ]}
      />

      <DemoGuide
        badges={[{ label: 'INCR + EXPIRE', tone: 'red' }, { label: 'SET / SISMEMBER', tone: 'red' }]}
        overview={[
          'Velocity counters per cust × per minute / hour / day (INCR + EXPIRE) — no batch jobs.',
          'Watchlist is a Redis SET — O(1) membership across customers, accounts, IBANs, phones.',
          'Decision (APPROVE / REVIEW / BLOCK) is logged into a stream as an audit trail.',
        ]}
        steps={[
          { action: 'Pick a customer in the picker', expect: 'Live counters & limits load for that customer' },
          { action: 'Click Check (with default amount)', expect: 'APPROVE — score below threshold; trace shows ~12 Redis commands' },
          { action: 'Click Burst x 8 quickly', expect: 'Velocity gauge fills, decision flips to REVIEW/BLOCK' },
          { action: 'Add BAD-CUST to the Watchlist', expect: 'Set acquires a member, badge appears' },
          { action: 'Repeat Check', expect: 'Decision is BLOCK; trace shows SISMEMBER returning 1' },
          { action: 'Scroll to Query trace', expect: 'See the literal SISMEMBER / INCR / ZADD / XADD list with per-command timing' },
        ]}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card title="Submit transaction" className="col-span-5" subtitle="Triggers /uc6/check">
          <div className="space-y-3">
            <div>
              <div className="tilt-tag text-redis-warm/45 mb-1.5">Customer</div>
              <CustomerPicker value={custId} onChange={setCustId} height={150} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="tilt-tag text-redis-warm/45">Amount (₹)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full mt-1"
                />
              </div>
              <div>
                <label className="tilt-tag text-redis-warm/45">Beneficiary</label>
                <Input
                  value={bene}
                  onChange={(e) => setBene(e.target.value)}
                  className="w-full mt-1"
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button onClick={check} className="flex-1">
                <Send size={12} /> Check
              </Button>
              <Button tone="soft" onClick={burst}>
                <Zap size={12} /> Burst x 8
              </Button>
            </div>
            {last && <DecisionCard d={last} />}
          </div>
        </Card>

        <Card
          title="Live counters & limits"
          className="col-span-7"
          subtitle={`for ${custId} · counters live in Redis with TTL`}
        >
          <div className="grid grid-cols-12 gap-3 items-center">
            <div className="col-span-4 flex justify-center">
              <RingGauge
                value={counters['1m']}
                max={Math.max(limits.maxVelPerMin, 1)}
                size={130}
                thickness={11}
                tone={
                  counters['1m'] > limits.maxVelPerMin
                    ? 'red'
                    : counters['1m'] > limits.maxVelPerMin * 0.7
                      ? 'yellow'
                      : 'mint'
                }
                label={`${counters['1m']}/${limits.maxVelPerMin}`}
                sub="velocity 1m"
              />
            </div>
            <div className="col-span-8 grid grid-cols-2 gap-2">
              <Stat label="Velocity 1h" value={counters['1h']} icon={Activity} tone="lavender" hint="rolling window" />
              <Stat label="Velocity 24h" value={counters['24h']} icon={Activity} tone="lavender" hint="rolling window" />
              <Stat
                label="Per-txn limit"
                value={`₹ ${limits.perTxn.toLocaleString('en-IN')}`}
                hint="hard ceiling"
                tone="yellow"
              />
              <Stat
                label="Daily limit"
                value={`₹ ${limits.daily.toLocaleString('en-IN')}`}
                hint="rolling 24h"
                tone="yellow"
              />
            </div>
          </div>
          <div className="mt-3">
            <div className="tilt-tag text-redis-warm/40 mb-2 flex items-center gap-1.5">
              <ListChecks size={11} /> Recent transactions (LIST)
            </div>
            {!state?.recent || state.recent.length === 0 ? (
              <div className="text-[11.5px] text-redis-warm/40 text-center py-3">
                no recent txns yet
              </div>
            ) : (
              <div className="space-y-1 max-h-36 overflow-auto custom-scroll pr-1">
                {state.recent.map((r) => (
                  <div
                    key={r.txnId}
                    className="flex justify-between items-center px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[11.5px] hover:bg-white/[0.04]"
                  >
                    <span className="code text-redis-warm/75 truncate">
                      {r.txnId} · ₹ {r.amount} · {r.beneficiary}
                    </span>
                    <Pill
                      tone={r.score >= 80 ? 'red' : r.score >= 40 ? 'yellow' : 'mint'}
                      size="sm"
                    >
                      {r.score}
                    </Pill>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card title="Watchlist (SET)" className="col-span-5" subtitle="fraud:watchlist · O(1) membership">
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="customer, account, IBAN, phone…"
              value={newWatch}
              onChange={(e) => setNewWatch(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addWatch()}
            />
            <Button onClick={addWatch}>
              <Plus size={13} />
            </Button>
          </div>
          {!state?.watchlist || state.watchlist.length === 0 ? (
            <Empty icon={ShieldAlert} message="Watchlist is empty" hint="Add an entry — try BAD-CUST" />
          ) : (
            <div className="space-y-1 max-h-44 overflow-auto custom-scroll pr-1">
              {state.watchlist.map((w) => (
                <div
                  key={w}
                  className="flex justify-between items-center px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Ban size={11} className="text-redis-hyper shrink-0" />
                    <span className="code text-[12px] text-redis-warm/85 truncate">{w}</span>
                  </div>
                  <button
                    onClick={() => removeWatch(w)}
                    className="text-redis-warm/40 hover:text-redis-hyper"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Decision log (Redis Stream)"
          className="col-span-7"
          subtitle="fraud:decisions · MAXLEN ~ 500 · timeline view"
          padded={false}
        >
          {decisions.length === 0 ? (
            <div className="px-5 py-6">
              <Empty icon={ShieldAlert} message="No decisions yet" hint="Check a transaction above" />
            </div>
          ) : (
            <div className="max-h-72 overflow-auto custom-scroll">
              <div className="relative pl-5 pr-4 py-2">
                <div className="absolute left-7 top-2 bottom-2 w-px bg-white/8" />
                {decisions.map((d) => {
                  const meta = DECISION_TONES[d.decision] || DECISION_TONES.APPROVE;
                  const Icon = meta.icon;
                  return (
                    <div key={d.id} className="relative pl-5 py-1.5">
                      <span
                        className="absolute left-[-3px] top-2.5 w-3.5 h-3.5 rounded-full border-2 border-[#08131c]"
                        style={{ background: meta.color }}
                      />
                      <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04]">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Pill tone={meta.tone} size="sm">
                              <Icon size={10} /> {d.decision}
                            </Pill>
                            <Avatar name={d.custId} segment="Retail" size={20} />
                            <span className="code text-[11px] text-redis-warm truncate">
                              {d.custId} · ₹{d.amount} → {d.beneficiary}
                            </span>
                          </div>
                          <span className="code text-[10px] text-redis-warm/45 shrink-0">
                            score {d.score}
                          </span>
                        </div>
                        {d.reasons && d.reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {d.reasons.map((r, i) => (
                              <span
                                key={i}
                                className="text-[10px] code px-1.5 py-[1px] rounded bg-redis-hyper/10 text-redis-hyper border border-redis-hyper/25"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Query trace · what actually ran"
        subtitle="Last fraud decision · every Redis command involved with per-call timing"
      >
        <CommandTrace
          tone="red"
          icon={Zap}
          label={
            deferredLast?.decision
              ? `Decision: ${deferredLast.decision} · score ${deferredLast.score}`
              : 'No decision yet'
          }
          note={
            deferredLast?.txnId
              ? `${deferredLast.txnId} · ₹${deferredLast.amount} → ${deferredLast.beneficiary || 'na'}`
              : 'click Check or Burst to populate'
          }
          steps={deferredLast?.trace || []}
          totalLatency={deferredLast?.latencyMs}
          output={
            deferredLast
              ? {
                  txnId: deferredLast.txnId,
                  decision: deferredLast.decision,
                  score: deferredLast.score,
                  reasons: deferredLast.reasons,
                  counters: deferredLast.counters,
                  dailyTotal: deferredLast.dailyTotal,
                  limits: deferredLast.limits,
                }
              : undefined
          }
          emptyMessage="Click Check or Burst x 8 to populate the trace"
        />
      </Card>
    </div>
  );
}

function DecisionCard({ d }) {
  const meta = DECISION_TONES[d.decision] || DECISION_TONES.APPROVE;
  const Icon = meta.icon;
  return (
    <div
      className={`rounded-xl p-3 border fadein ${
        d.decision === 'BLOCK'
          ? 'bg-redis-hyper/10 border-redis-hyper/40'
          : d.decision === 'REVIEW'
            ? 'bg-redis-yellow/10 border-redis-yellow/40'
            : 'bg-redis-mint/10 border-redis-mint/40'
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <Pill tone={meta.tone}>
          <Icon size={11} /> {d.decision}
        </Pill>
        <span className="code text-[10.5px] text-redis-warm/55">
          score {d.score} · {d.latencyMs} ms
        </span>
      </div>
      {d.reasons?.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {d.reasons.map((r, i) => (
            <span
              key={i}
              className="text-[10.5px] code px-1.5 py-[2px] rounded border border-redis-hyper/25 bg-redis-hyper/10 text-redis-hyper"
            >
              {r}
            </span>
          ))}
        </div>
      ) : (
        <div className="text-[12px] text-redis-warm/65 flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-redis-mint" /> All checks passed
        </div>
      )}
    </div>
  );
}
