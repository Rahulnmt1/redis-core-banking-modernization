import React, { useEffect, useRef, useState } from 'react';
import { Card, Pill, Sparkline } from './ui.jsx';
import { Activity, Zap } from 'lucide-react';

export default function RdiPanel({ rdi, events }) {
  const [history, setHistory] = useState([]);
  const lastEvent = events.find((e) => e.type === 'rdi:event');
  const [pulse, setPulse] = useState(false);
  const lastTs = useRef(0);

  useEffect(() => {
    if (!lastEvent || lastEvent.ts === lastTs.current) return;
    lastTs.current = lastEvent.ts;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 700);
    return () => clearTimeout(t);
  }, [lastEvent?.ts]);

  useEffect(() => {
    if (!rdi) return;
    setHistory((h) => [...h, rdi.eventsPerSec || 0].slice(-50));
  }, [rdi?.eventsProcessed]);

  return (
    <Card
      title="Redis Data Integration"
      subtitle="Postgres → CDC → Redis"
      right={
        <Pill tone={rdi?.status === 'running' ? 'mint' : 'red'}>
          <Activity size={11} /> {rdi?.status || 'starting'}
        </Pill>
      }
    >
      <svg viewBox="0 0 280 90" className="w-full mb-2">
        <defs>
          <linearGradient id="rdiPipe" x1="0" x2="1">
            <stop offset="0" stopColor="#3a558b" />
            <stop offset="1" stopColor="#FF4438" />
          </linearGradient>
        </defs>
        <rect x="6" y="22" width="64" height="46" rx="9" fill="#1c2942" stroke="#3a558b" />
        <text x="38" y="42" textAnchor="middle" fontSize="11" fontFamily="Space Grotesk" fill="#cdd9ff" fontWeight="600">
          Postgres
        </text>
        <text x="38" y="56" textAnchor="middle" fontSize="9" fill="#cdd9ff" opacity="0.65">
          BaNCS-style CBS
        </text>

        <rect
          x="103"
          y="30"
          width="74"
          height="30"
          rx="7"
          fill={pulse ? '#FF4438' : '#15243a'}
          stroke="url(#rdiPipe)"
          strokeWidth="1.4"
        />
        <text x="140" y="49" textAnchor="middle" fontSize="11" fontFamily="Space Grotesk" fontWeight="600" fill={pulse ? '#0a141a' : '#FBF7F1'}>
          RDI
        </text>

        <rect x="210" y="22" width="64" height="46" rx="9" fill="#FF4438" />
        <text x="242" y="42" textAnchor="middle" fontSize="11" fontFamily="Space Grotesk" fontWeight="700" fill="#0a141a">
          Redis
        </text>
        <text x="242" y="56" textAnchor="middle" fontSize="9" fill="#0a141a" opacity="0.7">
          Enterprise
        </text>

        <line x1="70" y1="45" x2="103" y2="45" stroke={pulse ? '#FF4438' : '#3a516a'} strokeWidth="1.8" className={pulse ? 'flow-edge' : ''} />
        <line x1="177" y1="45" x2="210" y2="45" stroke={pulse ? '#FF4438' : '#3a516a'} strokeWidth="1.8" className={pulse ? 'flow-edge' : ''} />
      </svg>

      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
        <KV label="events" value={rdi?.eventsProcessed ?? 0} />
        <KV label="rate" value={`${rdi?.eventsPerSec ?? 0}/s`} accent />
        <KV label="lag" value={`${rdi?.avgLagMs ?? 0}ms`} />
      </div>
      <div className="mt-2">
        <Sparkline values={history} color="#FF4438" height={28} />
      </div>
      {lastEvent && (
        <div className="mt-2 text-[10px] code text-redis-warm/50 truncate">
          last: {lastEvent.data?.op} {lastEvent.data?.table} · key={lastEvent.data?.key} ·{' '}
          {lastEvent.data?.lagMs}ms
        </div>
      )}
    </Card>
  );
}

function KV({ label, value, accent }) {
  return (
    <div className="rounded bg-black/30 border border-white/5 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-redis-warm/40">{label}</div>
      <div className={`code mt-0.5 text-[12px] ${accent ? 'text-redis-hyper' : 'text-redis-warm'}`}>
        {value}
      </div>
    </div>
  );
}
