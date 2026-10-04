import React, { useState } from 'react';
import { Card, Pill, Button, Histogram, Bar } from './ui.jsx';
import { Database, Zap, Play, ArrowDown, Activity, ArrowRight, Award } from 'lucide-react';
import { api } from '../lib/api.js';

const PG_COLOR = '#7a8ed1';
const REDIS_COLOR = '#FF4438';

export default function BenchmarkCard({ uc, description, target, iterations = 25, query }) {
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const r = await api.post(
        `/api/bench/${uc}?iterations=${iterations}`,
        target ? { target } : null
      );
      setResult(r);
    } finally {
      setRunning(false);
    }
  }

  const speedup = result?.speedup || 0;
  const advantage = result?.advantage || `Click Run to compare on ${iterations} iterations`;
  const hasData = !!result;

  return (
    <Card
      accent
      title="Benchmark · Postgres vs Redis"
      subtitle={description || 'Same logical operation executed against both stores'}
      right={
        <Button onClick={run} disabled={running} size="sm">
          {running ? (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-ping" /> running…
            </span>
          ) : (
            <>
              <Play size={12} /> Run · {iterations} iter
            </>
          )}
        </Button>
      }
    >
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-full rounded-2xl glass-strong p-4 text-center overflow-hidden">
            <span
              aria-hidden
              className="absolute inset-0 opacity-50 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at top, rgba(255,68,56,0.15), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="tilt-tag text-redis-warm/40 flex items-center justify-center gap-1.5">
                <Award size={11} className="text-redis-hyper" />
                Speed-up factor
              </div>
              <div className="font-display text-[64px] leading-none mt-2 text-gradient-hyper font-bold">
                {hasData ? `${speedup}×` : '—'}
              </div>
              <div className="text-[12px] text-redis-warm/65 mt-1.5">{advantage}</div>
              {hasData && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-left">
                  <Tile
                    color={PG_COLOR}
                    icon={Database}
                    label="Postgres"
                    avg={result.postgres.avg}
                    p95={result.postgres.p95}
                  />
                  <Tile
                    color={REDIS_COLOR}
                    icon={Zap}
                    label="Redis"
                    avg={result.redis.avg}
                    p95={result.redis.p95}
                    accent
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-7 space-y-3">
          <DistRow
            label="Postgres"
            tone="lavender"
            color={PG_COLOR}
            icon={Database}
            samples={result?.postgres?.samples || []}
            avg={result?.postgres?.avg}
            p95={result?.postgres?.p95}
            min={result?.postgres?.min}
            max={result?.postgres?.max}
            scaleMax={result ? Math.max(result.postgres.max, result.redis.max) : null}
          />
          <DistRow
            label="Redis Enterprise"
            tone="red"
            color={REDIS_COLOR}
            icon={Zap}
            samples={result?.redis?.samples || []}
            avg={result?.redis?.avg}
            p95={result?.redis?.p95}
            min={result?.redis?.min}
            max={result?.redis?.max}
            scaleMax={result ? Math.max(result.postgres.max, result.redis.max) : null}
            highlight
          />
          {hasData && (
            <div className="flex items-center gap-2 text-[11px] text-redis-warm/55">
              <Pill tone="success" size="sm">
                <Activity size={10} /> {iterations} iterations
              </Pill>
              <span className="code">
                p95 ratio:{' '}
                <span className="text-redis-mint">
                  {(result.postgres.p95 / Math.max(result.redis.p95, 0.001)).toFixed(1)}×
                </span>
              </span>
              <span className="text-redis-warm/30">·</span>
              <span className="code">
                tail (max) ratio:{' '}
                <span className="text-redis-mint">
                  {(result.postgres.max / Math.max(result.redis.max, 0.001)).toFixed(1)}×
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {query && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <CodeBlock tone="pg" icon={Database} label="Postgres query" code={query.postgres} />
          <CodeBlock tone="redis" icon={Zap} label="Redis call" code={query.redis} />
        </div>
      )}
    </Card>
  );
}

function DistRow({ label, tone, color, icon: Icon, samples, avg, p95, min, max, scaleMax, highlight }) {
  const fill = scaleMax && avg != null ? (avg / scaleMax) * 100 : 0;
  return (
    <div
      className={`rounded-xl p-3 ${highlight ? 'bg-redis-hyper/[0.05] border border-redis-hyper/25' : 'bg-white/[0.025] border border-white/5'}`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Pill tone={tone} size="sm">
            <Icon size={11} /> {label}
          </Pill>
          {avg != null && (
            <span className="code text-[12px] text-redis-warm">
              avg <span className="text-redis-warm/95 font-medium">{avg} ms</span>
            </span>
          )}
        </div>
        {p95 != null && (
          <div className="text-[10.5px] code text-redis-warm/45 flex gap-2">
            <span>p95 {p95}</span>
            <span>·</span>
            <span>min {min}</span>
            <span>·</span>
            <span>max {max}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-4">
          <Bar
            value={fill}
            max={100}
            color={color}
            height={8}
          />
          <div className="text-[10px] text-redis-warm/35 mt-1 code">avg latency</div>
        </div>
        <div className="col-span-8">
          <Histogram samples={samples} color={color} height={48} bins={20} />
        </div>
      </div>
    </div>
  );
}

function Tile({ color, icon: Icon, label, avg, p95, accent }) {
  return (
    <div
      className={`rounded-lg px-2.5 py-1.5 border ${accent ? 'bg-redis-hyper/10 border-redis-hyper/35' : 'bg-white/[0.03] border-white/8'}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest" style={{ color }}>
        <Icon size={10} /> {label}
      </div>
      <div className="code text-[12px] text-redis-warm mt-0.5">
        {avg} <span className="text-redis-warm/40">ms</span>
      </div>
      <div className="text-[9.5px] code text-redis-warm/40">p95 {p95}</div>
    </div>
  );
}

function CodeBlock({ tone, icon: Icon, label, code }) {
  return (
    <div
      className={`rounded-lg p-2.5 ${
        tone === 'redis'
          ? 'bg-redis-hyper/[0.04] border border-redis-hyper/25'
          : 'bg-white/[0.025] border border-white/8'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Pill tone={tone === 'redis' ? 'red' : 'lavender'} size="sm">
          <Icon size={10} /> {label}
        </Pill>
      </div>
      <pre className="code text-[10.5px] text-redis-warm/85 whitespace-pre-wrap leading-relaxed">
        {code}
      </pre>
    </div>
  );
}
