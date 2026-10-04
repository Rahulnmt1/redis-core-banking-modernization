import React from 'react';
import { Pill, Code, Empty } from './ui.jsx';
import { Database, Zap, Search } from 'lucide-react';

const TONE_TEXT = {
  red: 'text-redis-hyper',
  mint: 'text-redis-mint',
  yellow: 'text-redis-yellow',
  lavender: 'text-redis-lavender',
  default: 'text-redis-warm',
};

const TONE_BORDER = {
  red: 'bg-redis-hyper/[0.05] border-redis-hyper/30',
  mint: 'bg-redis-mint/[0.04] border-redis-mint/30',
  yellow: 'bg-redis-yellow/[0.05] border-redis-yellow/30',
  lavender: 'bg-redis-lavender/[0.04] border-redis-lavender/30',
  default: 'bg-white/[0.02] border-white/8',
};

export const QueryTrace = React.memo(function QueryTrace({
  tone = 'default',
  highlight,
  icon: Icon,
  label,
  note,
  query,
  output,
  latency,
  ratio,
  ratioLabel,
  emptyMessage,
  scrollMax = 'max-h-72',
}) {
  const cls = highlight ? TONE_BORDER.red : TONE_BORDER[tone] || TONE_BORDER.default;
  const headColor = highlight ? TONE_TEXT.red : TONE_TEXT[tone] || TONE_TEXT.default;
  return (
    <div className={`rounded-xl p-3 border ${cls}`}>
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        {Icon && (
          <Pill tone={highlight ? 'red' : tone} size="sm">
            <Icon size={11} /> {label}
          </Pill>
        )}
        {note && (
          <span className="text-[10.5px] text-redis-warm/45 code">{note}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {ratio != null && (
            <Pill tone={highlight ? 'red' : 'default'} size="sm">
              {ratioLabel || `${ratio}×`}
            </Pill>
          )}
          <span className={`code text-[12px] ${headColor}`}>
            {latency != null ? `${latency} ms` : '—'}
          </span>
        </div>
      </div>

      <div className="tilt-tag text-redis-warm/45 mb-1">Query</div>
      <Code>{query || '—'}</Code>

      <div className="tilt-tag text-redis-warm/45 mt-2.5 mb-1 flex items-center justify-between">
        <span>Output</span>
      </div>
      {output != null ? (
        <div className={`rounded-lg border border-white/8 bg-black/35 ${scrollMax} overflow-auto custom-scroll`}>
          <pre className="text-[11px] code text-redis-warm/85 p-3 leading-snug whitespace-pre">
{typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/8 px-3 py-4 text-[11.5px] text-redis-warm/40 text-center">
          {emptyMessage || 'no result yet'}
        </div>
      )}
    </div>
  );
});

export const CommandTrace = React.memo(function CommandTrace({
  tone = 'red',
  label = 'Redis Enterprise',
  icon: Icon = Zap,
  note,
  steps = [],
  output,
  totalLatency,
  emptyMessage,
}) {
  const cls = TONE_BORDER[tone] || TONE_BORDER.red;
  const headColor = TONE_TEXT[tone] || TONE_TEXT.red;
  return (
    <div className={`rounded-xl p-3 border ${cls}`}>
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <Pill tone={tone} size="sm">
          <Icon size={11} /> {label}
        </Pill>
        {note && <span className="text-[10.5px] text-redis-warm/45 code">{note}</span>}
        <span className={`ml-auto code text-[12px] ${headColor}`}>
          {totalLatency != null ? `${totalLatency} ms total` : '—'}
        </span>
      </div>

      <div className="tilt-tag text-redis-warm/45 mb-1">
        Commands ({steps.length})
      </div>
      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/8 px-3 py-4 text-[11.5px] text-redis-warm/40 text-center">
          {emptyMessage || 'no commands yet'}
        </div>
      ) : (
        <div className="rounded-lg border border-white/8 bg-black/35 max-h-44 overflow-auto custom-scroll divide-y divide-white/[0.04]">
          {steps.map((s, i) => (
            <div key={i} className="px-3 py-1.5 hover:bg-white/[0.02]">
              <div className="flex items-baseline gap-2">
                <span className="code text-[10px] text-redis-warm/35 w-5 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="code text-[11px] text-redis-warm/85 flex-1 break-all">
                  {s.cmd}
                </span>
                {s.ms != null && (
                  <span className="code text-[10px] text-redis-mint shrink-0">
                    {s.ms} ms
                  </span>
                )}
              </div>
              {s.note && (
                <div className="ml-7 text-[10px] text-redis-warm/40 italic">
                  {s.note}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {output !== undefined && output !== null && (
        <>
          <div className="tilt-tag text-redis-warm/45 mt-2.5 mb-1">Output</div>
          <div className="rounded-lg border border-white/8 bg-black/35 max-h-56 overflow-auto custom-scroll">
            <pre className="text-[11px] code text-redis-warm/85 p-3 leading-snug whitespace-pre">
{typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
});

export function PgQueryIcon() {
  return <Database size={11} />;
}
export function RedisIcon() {
  return <Zap size={11} />;
}
export function SearchIcon() {
  return <Search size={11} />;
}
