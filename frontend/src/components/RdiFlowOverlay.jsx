import React, { useEffect, useState } from 'react';
import { Card, Pill } from './ui.jsx';
import { Activity } from 'lucide-react';

export default function RdiFlowOverlay({ events }) {
  const [pulse, setPulse] = useState(false);
  const lastRdi = events.find((e) => e.type === 'rdi:event');

  useEffect(() => {
    if (!lastRdi) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 800);
    return () => clearTimeout(t);
  }, [lastRdi?.ts]);

  return (
    <Card title="RDI / CDC flow" subtitle="CBS → Redis sync (live)">
      <svg viewBox="0 0 280 130" className="w-full">
        <defs>
          <linearGradient id="rdiGrad" x1="0" x2="1">
            <stop offset="0" stopColor="#FF4438" />
            <stop offset="1" stopColor="#C795E3" />
          </linearGradient>
        </defs>
        <rect x="6" y="40" width="80" height="50" rx="8" fill="#163341" stroke="#2A3D4D" />
        <text
          x="46"
          y="62"
          textAnchor="middle"
          fontSize="11"
          fill="#FBF7F1"
          fontFamily="Space Grotesk"
        >
          CBS
        </text>
        <text x="46" y="76" textAnchor="middle" fontSize="9" fill="#FBF7F1" opacity="0.5">
          BaNCS / Finacle
        </text>

        <rect
          x="105"
          y="50"
          width="70"
          height="30"
          rx="6"
          fill={pulse ? '#FF4438' : '#091A23'}
          stroke="url(#rdiGrad)"
          strokeWidth="1.4"
        />
        <text
          x="140"
          y="68"
          textAnchor="middle"
          fontSize="11"
          fontFamily="Space Grotesk"
          fill={pulse ? '#091A23' : '#FBF7F1'}
        >
          RDI
        </text>

        <rect x="194" y="40" width="80" height="50" rx="8" fill="#FF4438" />
        <text
          x="234"
          y="62"
          textAnchor="middle"
          fontSize="11"
          fill="#091A23"
          fontFamily="Space Grotesk"
          fontWeight="700"
        >
          Redis
        </text>
        <text x="234" y="76" textAnchor="middle" fontSize="9" fill="#091A23" opacity="0.7">
          JSON · Streams
        </text>

        <line
          x1="86"
          y1="65"
          x2="105"
          y2="65"
          stroke={pulse ? '#FF4438' : '#2A3D4D'}
          strokeWidth="2"
          className={pulse ? 'flow-edge' : ''}
        />
        <line
          x1="175"
          y1="65"
          x2="194"
          y2="65"
          stroke={pulse ? '#FF4438' : '#2A3D4D'}
          strokeWidth="2"
          className={pulse ? 'flow-edge' : ''}
        />
      </svg>
      <div className="flex items-center justify-between mt-2">
        <Pill tone={pulse ? 'red' : 'slate'}>
          <Activity size={12} /> {pulse ? 'syncing' : 'idle'}
        </Pill>
        <span className="text-[10px] code text-redis-warm/45">
          {lastRdi
            ? `${lastRdi.data.source || ''} → ${lastRdi.data.target || ''}`
            : 'no recent events'}
        </span>
      </div>
    </Card>
  );
}
