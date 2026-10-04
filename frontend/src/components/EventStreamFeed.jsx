import React from 'react';
import { Card, Pill, Empty } from './ui.jsx';
import { Activity, Radio } from 'lucide-react';

const TONE = {
  'rdi:event': 'red',
  'uc1:sync': 'red',
  'uc2:session': 'mint',
  'uc3:token': 'yellow',
  'uc4:publish': 'red',
  'uc4:consume': 'mint',
  'uc5:command': 'lavender',
  'uc5:cdc': 'red',
  'uc6:decision': 'red',
  'uc7:matched': 'mint',
  'uc7:exception': 'red',
  'bench:result': 'lavender',
};

const DOT = {
  red: '#FF4438',
  mint: '#80DBC4',
  yellow: '#FFE9A6',
  lavender: '#C795E3',
  default: 'rgba(255,255,255,0.5)',
};

export default function EventStreamFeed({ events }) {
  const filtered = events.filter(
    (e) => e.type !== 'metrics' && e.type !== 'inspect' && e.type !== 'rdi:status'
  );
  return (
    <Card
      title="Live event feed"
      subtitle="Cross-cutting · all 7 use cases"
      right={
        <Pill tone="red" size="sm">
          <Radio size={10} className="animate-pulse" /> sse
        </Pill>
      }
      padded={false}
    >
      {filtered.length === 0 ? (
        <div className="px-4 py-6">
          <Empty
            icon={Activity}
            message="Waiting for activity…"
            hint="Trigger an action — events stream live via SSE."
          />
        </div>
      ) : (
        <div className="max-h-72 overflow-auto custom-scroll">
          <div className="relative">
            {filtered.slice(0, 80).map((e, i) => {
              const tone = TONE[e.type] || 'default';
              return (
                <div
                  key={i}
                  className="group flex items-start gap-2 px-3 py-1.5 border-b border-white/[0.03] hover:bg-redis-hyper/[0.04] last:border-0 fadein"
                >
                  <span
                    className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 ring-2 ring-[#08131c]"
                    style={{ background: DOT[tone] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="text-[10px] code uppercase tracking-wider"
                        style={{ color: DOT[tone] }}
                      >
                        {e.type.replace(/^[a-z]+:/, '')}
                      </span>
                      <span className="text-[9px] text-redis-warm/30 ml-auto code shrink-0">
                        {new Date(e.ts).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="code text-[10.5px] text-redis-warm/70 truncate">
                      {summarize(e.data)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function summarize(d) {
  if (!d || typeof d !== 'object') return String(d);
  const keys = Object.keys(d).slice(0, 4);
  return keys.map((k) => `${k}=${truncate(d[k])}`).join(' · ');
}
function truncate(v) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 26 ? s.slice(0, 24) + '…' : s;
}
