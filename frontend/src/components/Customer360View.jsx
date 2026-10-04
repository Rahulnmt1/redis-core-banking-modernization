import React, { useState } from 'react';
import { Avatar, Pill, Bar, Empty } from './ui.jsx';
import {
  Wallet,
  CreditCard,
  Building2,
  ArrowDownUp,
  Database,
  Zap,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  IndianRupee,
  Smartphone,
  Globe,
  Banknote,
  RadioTower,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

const TABS = [
  { id: 'accounts', label: 'Accounts', icon: Wallet },
  { id: 'loans', label: 'Loans', icon: Building2 },
  { id: 'cards', label: 'Cards', icon: CreditCard },
  { id: 'txns', label: 'Recent transactions', icon: ArrowDownUp },
];

const CHANNEL_ICONS = {
  MOBILE: Smartphone,
  WEB: Globe,
  BRANCH: Building2,
  ATM: Banknote,
  UPI: RadioTower,
  POS: CreditCard,
  IMPS: RadioTower,
  NEFT: RadioTower,
};

export default function Customer360View({ redis, postgres, onPickAccount }) {
  const [tab, setTab] = useState('accounts');
  const [source, setSource] = useState('redis');

  const active = source === 'redis' ? redis : postgres;
  const data = active?.data;
  const latency = active?.latencyMs;
  const speedup =
    redis?.latencyMs && postgres?.latencyMs
      ? Math.max(1, Math.round(postgres.latencyMs / redis.latencyMs))
      : null;

  if (!data) {
    return <Empty icon={ArrowDownUp} message="No customer selected" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Avatar name={data.name} segment={data.segment} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-[18px] text-redis-warm leading-tight truncate">
              {data.name}
            </h3>
            <Pill
              tone={
                data.segment === 'Wealth'
                  ? 'lavender'
                  : data.segment === 'Priority'
                    ? 'yellow'
                    : 'mint'
              }
              size="sm"
            >
              {data.segment}
            </Pill>
            {data.kyc === 'VERIFIED' && (
              <Pill tone="mint" size="sm">
                <ShieldCheck size={10} /> KYC verified
              </Pill>
            )}
          </div>
          <div className="text-[11px] text-redis-warm/45 code mt-0.5">{data.custId}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11.5px] text-redis-warm/60">
            {data.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} />
                {data.city}
              </span>
            )}
            {data.email && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail size={11} />
                {data.email}
              </span>
            )}
            {data.phone && (
              <span className="inline-flex items-center gap-1 code text-[10.5px]">
                <Phone size={11} />
                {data.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-2 flex items-center gap-1">
        <SourceToggle
          icon={Zap}
          label="Redis"
          latency={redis?.latencyMs}
          active={source === 'redis'}
          accent
          onClick={() => setSource('redis')}
        />
        <SourceToggle
          icon={Database}
          label="Postgres"
          latency={postgres?.latencyMs}
          active={source === 'postgres'}
          onClick={() => setSource('postgres')}
        />
        {speedup != null && (
          <div className="ml-auto pr-1.5">
            <Pill tone="red" size="sm">
              Redis {speedup}× faster
            </Pill>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Mini
          label="Total balance"
          value={fmtINR(data.summary?.totalBalance)}
          icon={IndianRupee}
          tone="mint"
        />
        <Mini
          label="Loan outstanding"
          value={fmtINR(data.summary?.totalLoanOutstanding)}
          icon={Building2}
          tone="yellow"
        />
        <Mini
          label="Card limit"
          value={fmtINR(data.summary?.cardLimit)}
          icon={CreditCard}
          tone="lavender"
        />
        <Mini
          label="Total relationship"
          value={fmtINR(data.totalRelationship ?? data.summary?.totalBalance)}
          icon={IndianRupee}
          tone="red"
          accent
        />
      </div>

      <div className="flex gap-1 border-b border-white/8 -mb-px">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const count =
            t.id === 'accounts'
              ? data.accounts?.length
              : t.id === 'loans'
                ? data.loans?.length
                : t.id === 'cards'
                  ? data.cards?.length
                  : data.recentTxns?.length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-2 text-[12px] inline-flex items-center gap-1.5 transition-all ${
                isActive
                  ? 'text-redis-hyper'
                  : 'text-redis-warm/55 hover:text-redis-warm'
              }`}
            >
              <Icon size={12} />
              {t.label}
              <span
                className={`text-[10px] code px-1.5 rounded ${
                  isActive
                    ? 'bg-redis-hyper/15 text-redis-hyper'
                    : 'bg-white/5 text-redis-warm/55'
                }`}
              >
                {count ?? 0}
              </span>
              {isActive && (
                <span className="absolute -bottom-px left-2 right-2 h-px bg-redis-hyper" />
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-[180px]">
        {tab === 'accounts' && <AccountsList accounts={data.accounts} onPick={onPickAccount} />}
        {tab === 'loans' && <LoansList loans={data.loans} />}
        {tab === 'cards' && <CardsList cards={data.cards} />}
        {tab === 'txns' && <TxnsList txns={data.recentTxns} />}
      </div>
    </div>
  );
}

function SourceToggle({ icon: Icon, label, latency, active, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all border ${
        active
          ? accent
            ? 'bg-redis-hyper/10 border-redis-hyper/40 text-redis-hyper'
            : 'bg-redis-lavender/10 border-redis-lavender/35 text-redis-lavender'
          : 'border-transparent text-redis-warm/55 hover:bg-white/[0.04]'
      }`}
    >
      <Icon size={12} />
      <span className="text-[12px]">{label}</span>
      <span className="ml-auto code text-[11px]">
        {latency != null ? `${latency} ms` : '—'}
      </span>
    </button>
  );
}

function Mini({ label, value, icon: Icon, tone, accent }) {
  const colorMap = {
    red: 'text-redis-hyper',
    mint: 'text-redis-mint',
    yellow: 'text-redis-yellow',
    lavender: 'text-redis-lavender',
  };
  return (
    <div
      className={`rounded-lg px-2.5 py-2 border ${
        accent
          ? 'bg-redis-hyper/8 border-redis-hyper/30'
          : 'bg-white/[0.025] border-white/8'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="tilt-tag text-redis-warm/45 truncate">{label}</span>
        {Icon && <Icon size={11} className={`${colorMap[tone]} opacity-80`} />}
      </div>
      <div className={`code text-[15px] mt-0.5 leading-tight ${colorMap[tone] || 'text-redis-warm'}`}>
        {value}
      </div>
    </div>
  );
}

function AccountsList({ accounts = [], onPick }) {
  if (accounts.length === 0)
    return <Empty icon={Wallet} message="No accounts" hint="Customer has no deposit products" />;
  const max = Math.max(...accounts.map((a) => a.balance), 1);
  return (
    <div className="space-y-1.5 pt-2">
      {accounts.map((a) => (
        <div
          key={a.acctId}
          className="rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex w-7 h-7 rounded-md bg-redis-mint/10 border border-redis-mint/25 items-center justify-center text-redis-mint">
              <Wallet size={13} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[12.5px] code text-redis-warm">{a.acctId}</span>
                <Pill size="sm">{a.type}</Pill>
              </div>
              <div className="mt-1">
                <Bar value={a.balance} max={max} color="#80DBC4" height={4} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="code text-[14px] text-redis-mint leading-tight">
                {fmtINR(a.balance)}
              </div>
              <div className="text-[10px] text-redis-warm/40 code">{a.currency || 'INR'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoansList({ loans = [] }) {
  if (loans.length === 0)
    return <Empty icon={Building2} message="No loans" hint="Customer has no active loan products" />;
  return (
    <div className="space-y-1.5 pt-2">
      {loans.map((l) => {
        const utilPct = l.principal ? Math.min(100, (l.outstanding / l.principal) * 100) : 0;
        return (
          <div
            key={l.loanId}
            className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex w-7 h-7 rounded-md bg-redis-yellow/10 border border-redis-yellow/25 items-center justify-center text-redis-yellow">
                <Building2 size={13} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] code text-redis-warm">{l.loanId}</span>
                  <Pill size="sm" tone="yellow">
                    {l.product}
                  </Pill>
                </div>
                <div className="mt-1">
                  <Bar value={utilPct} max={100} color="#FFE9A6" height={4} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="code text-[13px] text-redis-yellow leading-tight">
                  {fmtINR(l.outstanding)}
                </div>
                <div className="text-[10px] text-redis-warm/40 code">
                  of {fmtINR(l.principal || 0)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardsList({ cards = [] }) {
  if (cards.length === 0)
    return <Empty icon={CreditCard} message="No cards" hint="Customer has no active cards" />;
  return (
    <div className="space-y-1.5 pt-2">
      {cards.map((c) => {
        const usedPct = c.limit ? Math.min(100, ((c.used || 0) / c.limit) * 100) : 0;
        return (
          <div
            key={c.cardId}
            className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex w-7 h-7 rounded-md bg-redis-lavender/10 border border-redis-lavender/25 items-center justify-center text-redis-lavender">
                <CreditCard size={13} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] code text-redis-warm">{c.cardId}</span>
                  <Pill size="sm" tone="lavender">
                    {c.type}
                  </Pill>
                </div>
                <div className="mt-1">
                  <Bar
                    value={usedPct}
                    max={100}
                    color={usedPct > 80 ? '#FF4438' : '#C795E3'}
                    height={4}
                  />
                </div>
                <div className="text-[10px] text-redis-warm/40 code mt-0.5">
                  {Math.round(usedPct)}% utilization
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="code text-[13px] text-redis-lavender leading-tight">
                  {fmtINR(c.used || 0)} / {fmtINR(c.limit)}
                </div>
                <div className="text-[10px] text-redis-warm/40 code">
                  {fmtINR(c.limit - (c.used || 0))} avail
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TxnsList({ txns = [] }) {
  if (txns.length === 0)
    return <Empty icon={ArrowDownUp} message="No transactions" />;
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] divide-y divide-white/[0.04] mt-2 overflow-hidden">
      {txns.map((t) => {
        const isCredit = t.type === 'CREDIT';
        const Icon = isCredit ? ArrowDownLeft : ArrowUpRight;
        const ChannelIcon = CHANNEL_ICONS[t.channel] || RadioTower;
        return (
          <div key={t.txnId} className="px-3 py-2 hover:bg-redis-hyper/[0.04] flex items-center gap-2.5">
            <span
              className={`inline-flex w-7 h-7 rounded-md border items-center justify-center ${
                isCredit
                  ? 'bg-redis-mint/10 border-redis-mint/25 text-redis-mint'
                  : 'bg-redis-hyper/10 border-redis-hyper/25 text-redis-hyper'
              }`}
            >
              <Icon size={13} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-redis-warm truncate">{t.narrative}</div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] code text-redis-warm/45">
                <ChannelIcon size={9} className="text-redis-warm/55" />
                <span>{t.channel}</span>
                <span className="text-redis-warm/30">·</span>
                <span>{t.acctId}</span>
                <span className="text-redis-warm/30">·</span>
                <span>{fmtTime(t.ts)}</span>
              </div>
            </div>
            <div className={`shrink-0 code text-[13px] ${isCredit ? 'text-redis-mint' : 'text-redis-hyper'}`}>
              {isCredit ? '+' : '−'} {fmtINR(t.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtINR(n) {
  if (n == null) return '—';
  const v = Number(n);
  return '₹ ' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
