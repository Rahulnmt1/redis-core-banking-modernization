import React, { useEffect, useRef, useState } from 'react';
import { Stat } from './ui.jsx';
import {
  Database,
  Zap,
  Activity,
  ShieldAlert,
  Inbox,
  ArrowDownUp,
  CheckCheck,
} from 'lucide-react';

const TRACK = [
  { key: 'cbsReads', label: 'Postgres reads', hint: 'multi-table fan-out', tone: 'lavender', icon: Database },
  { key: 'redisReads', label: 'Redis reads', hint: 'sub-millisecond', tone: 'mint', icon: Zap, accent: true },
  { key: 'redisWrites', label: 'Redis writes', hint: 'JSON / Hash / Stream', tone: 'default', icon: Activity },
  { key: 'streamsPublished', label: 'Streams ↑', hint: 'published events', tone: 'red', icon: Inbox },
  { key: 'streamsConsumed', label: 'Streams ↓', hint: 'acknowledged', tone: 'default', icon: ArrowDownUp },
  { key: 'fraudDecisions', label: 'Fraud decisions', hint: 'approve / review / block', tone: 'red', icon: ShieldAlert },
];

const HISTORY_LEN = 20;

export default function KpiStrip({ metrics }) {
  const m = metrics || {};
  const [history, setHistory] = useState({});
  const lastRef = useRef({});

  useEffect(() => {
    if (!metrics) return;
    setHistory((prev) => {
      const next = { ...prev };
      for (const t of TRACK) {
        const cur = m[t.key] ?? 0;
        const last = lastRef.current[t.key] ?? cur;
        const delta = Math.max(0, cur - last);
        const arr = (next[t.key] || []).slice(-HISTORY_LEN);
        arr.push(delta);
        next[t.key] = arr;
        lastRef.current[t.key] = cur;
      }
      return next;
    });
  }, [metrics]);

  return (
    <div className="grid grid-cols-7 gap-2.5 px-6 pt-4">
      {TRACK.map((t) => (
        <Stat
          key={t.key}
          label={t.label}
          value={(m[t.key] ?? 0).toLocaleString()}
          hint={t.hint}
          tone={t.tone}
          icon={t.icon}
          accent={t.accent}
          trend={history[t.key]}
        />
      ))}
      <Stat
        label="Recon"
        value={`${m.reconMatched ?? 0} / ${m.reconExceptions ?? 0}`}
        hint="matched / exceptions"
        icon={CheckCheck}
        tone="mint"
      />
    </div>
  );
}
