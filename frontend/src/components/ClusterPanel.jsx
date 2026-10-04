import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Card, Pill } from './ui.jsx';
import { Server, Database } from 'lucide-react';

export default function ClusterPanel() {
  const [cluster, setCluster] = useState(null);
  useEffect(() => {
    let mounted = true;
    async function tick() {
      try {
        const c = await api.get('/api/cluster');
        if (mounted) setCluster(c);
      } catch {}
    }
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  return (
    <Card
      title="Redis Enterprise"
      subtitle="cbs-cache · port 12000"
      right={
        <Pill tone="red">
          <Server size={11} /> {cluster?.version || '—'}
        </Pill>
      }
    >
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <KV k="ops/sec" v={cluster?.instantaneous_ops_per_sec ?? '—'} accent />
        <KV k="keys" v={cluster?.keys ?? '—'} />
        <KV k="memory" v={cluster?.used_memory_human || '—'} />
        <KV k="peak" v={cluster?.used_memory_peak_human || '—'} />
        <KV k="connections" v={cluster?.total_connections_received ?? '—'} />
        <KV k="commands" v={cluster?.total_commands_processed ?? '—'} />
      </div>
      <div className="divider-soft my-3" />
      <div className="flex items-center gap-2 text-[11px] text-redis-warm/55">
        <Database size={11} /> Modules: <span className="text-redis-mint code">JSON</span>
        <span className="text-redis-warm/30">·</span>
        <span className="text-redis-mint code">Search</span>
        <span className="text-redis-warm/30">·</span>
        <span className="text-redis-mint code">Streams</span>
      </div>
    </Card>
  );
}

function KV({ k, v, accent }) {
  return (
    <div className="rounded-lg bg-black/25 border border-white/5 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-widest text-redis-warm/40">{k}</div>
      <div className={`code text-[14px] mt-0.5 ${accent ? 'text-redis-hyper' : 'text-redis-warm'}`}>
        {v}
      </div>
    </div>
  );
}
