import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Input, Pill, Empty } from './ui.jsx';
import { api } from '../lib/api.js';
import { Search, Users, X } from 'lucide-react';

const SEGMENTS = ['ALL', 'Retail', 'Priority', 'Wealth'];

export default function CustomerPicker({ value, onChange, autoFocus = false, height = 280 }) {
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState('ALL');
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (segment) params.set('segment', segment);
        params.set('limit', '50');
        const r = await api.get(`/api/customers?${params}`);
        if (!cancelled) setData(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, segment]);

  const total = data.total || 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-redis-warm/35 pointer-events-none"
        />
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, ID, or city…"
          className="pl-8 w-full"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-redis-warm/40 hover:text-redis-warm"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {SEGMENTS.map((s) => (
          <button
            key={s}
            onClick={() => setSegment(s)}
            className={`px-2 py-[3px] rounded-full text-[10.5px] uppercase tracking-wider border transition-all ${
              segment === s
                ? 'bg-redis-hyper/15 border-redis-hyper/40 text-redis-hyper'
                : 'bg-white/3 border-white/8 text-redis-warm/55 hover:border-redis-hyper/25 hover:text-redis-warm'
            }`}
          >
            {s === 'ALL' ? 'All' : s}
          </button>
        ))}
        <span className="text-[10.5px] code text-redis-warm/40 ml-auto">
          {loading ? 'searching…' : `${data.items.length}/${total.toLocaleString()}`}
        </span>
      </div>

      <div
        className="rounded-lg border border-white/5 bg-black/20 overflow-auto custom-scroll"
        style={{ height }}
      >
        {data.items.length === 0 && !loading && (
          <Empty icon={Users} message="No customers match this filter" />
        )}
        {data.items.map((c) => {
          const active = value === c.custId;
          return (
            <button
              key={c.custId}
              onClick={() => onChange?.(c.custId)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all border-b border-white/[0.04] last:border-0 ${
                active
                  ? 'bg-redis-hyper/8'
                  : 'hover:bg-white/[0.025]'
              }`}
            >
              <Avatar name={c.name} segment={c.segment} size={28} />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[13px] font-medium truncate ${
                    active ? 'text-redis-hyper' : 'text-redis-warm'
                  }`}
                >
                  {c.name}
                </div>
                <div className="text-[10.5px] text-redis-warm/45 code truncate">
                  {c.custId} · {c.city}
                </div>
              </div>
              <Pill
                tone={c.segment === 'Wealth' ? 'lavender' : c.segment === 'Priority' ? 'yellow' : 'mint'}
                size="sm"
              >
                {c.segment}
              </Pill>
            </button>
          );
        })}
      </div>
    </div>
  );
}
