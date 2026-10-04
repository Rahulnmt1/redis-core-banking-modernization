import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, Pill, Code } from './ui.jsx';
import { Database, ChevronRight } from 'lucide-react';

export default function RedisInspector() {
  const [summary, setSummary] = useState(null);
  const [openPrefix, setOpenPrefix] = useState(null);
  const [keys, setKeys] = useState([]);
  const [selected, setSelected] = useState(null);

  async function refresh() {
    try {
      const s = await api.get('/api/inspect/summary');
      setSummary(s);
    } catch {}
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  async function openPrefixHandler(p) {
    setOpenPrefix(p.id);
    setSelected(null);
    const r = await api.get(`/api/inspect/keys/${p.id}`);
    setKeys(r.keys || []);
  }

  async function inspectKey(k) {
    const r = await api.get(`/api/inspect/key?key=${encodeURIComponent(k)}`);
    setSelected(r);
  }

  return (
    <Card
      title="Live Redis state"
      subtitle={`${summary?.dbsize ?? 0} keys · auto-refresh`}
      right={
        <Pill tone="red">
          <Database size={11} />
          inspector
        </Pill>
      }
    >
      <div className="space-y-1 max-h-64 overflow-auto pr-1">
        {summary?.prefixes?.map((p) => (
          <div key={p.id}>
            <button
              onClick={() => openPrefixHandler(p)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[11.5px] border transition-all ${
                openPrefix === p.id
                  ? 'bg-redis-hyper/8 border-redis-hyper/35'
                  : 'border-white/5 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  size={11}
                  className={openPrefix === p.id ? 'rotate-90 transition-transform text-redis-hyper' : 'text-redis-warm/40'}
                />
                <span className="code text-redis-mint/95">{p.match}</span>
              </div>
              <span className="text-redis-warm/45 code">{p.count}</span>
            </button>
            {openPrefix === p.id && keys.length > 0 && (
              <div className="ml-5 mt-1 space-y-0.5 border-l border-white/5 pl-2 fadein">
                {keys.slice(0, 25).map((k) => (
                  <button
                    key={k}
                    onClick={() => inspectKey(k)}
                    className={`block w-full text-left code text-[11px] truncate px-2 py-1 rounded transition ${
                      selected?.key === k
                        ? 'bg-white/10 text-redis-hyper'
                        : 'text-redis-warm/65 hover:bg-white/5 hover:text-redis-warm'
                    }`}
                    title={k}
                  >
                    {k}
                  </button>
                ))}
                {keys.length > 25 && (
                  <div className="text-[10px] text-redis-warm/40 px-2 py-1">+ {keys.length - 25} more</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {selected && (
        <div className="mt-3 fadein">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="lavender">{selected.type}</Pill>
            {selected.ttl > 0 && <Pill tone="yellow">TTL {selected.ttl}s</Pill>}
            {selected.ttl === -1 && <Pill>no TTL</Pill>}
          </div>
          <Code className="max-h-44">{JSON.stringify(selected.value, null, 2)}</Code>
        </div>
      )}
    </Card>
  );
}
