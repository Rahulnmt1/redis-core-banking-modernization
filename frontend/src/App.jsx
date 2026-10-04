import React, { useEffect, useState } from 'react';
import {
  Users,
  Smartphone,
  KeyRound,
  Workflow,
  Layers,
  ShieldAlert,
  CheckCheck,
  Database,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { useSSE } from './lib/sse.js';
import { api } from './lib/api.js';
import { Pill } from './components/ui.jsx';

import UC1Customer360 from './panels/UC1Customer360.jsx';
import UC2Sessions from './panels/UC2Sessions.jsx';
import UC3OpenBanking from './panels/UC3OpenBanking.jsx';
import UC4EventHub from './panels/UC4EventHub.jsx';
import UC5CQRS from './panels/UC5CQRS.jsx';
import UC6Fraud from './panels/UC6Fraud.jsx';
import UC7Reconciliation from './panels/UC7Reconciliation.jsx';

const NAV = [
  { id: 'uc1', label: 'Customer 360', icon: Users, hint: 'Account aggregation' },
  { id: 'uc2', label: 'Omnichannel Sessions', icon: Smartphone, hint: 'Auth & journey state' },
  { id: 'uc3', label: 'Open Banking', icon: KeyRound, hint: 'Tokens & rate limits' },
  { id: 'uc4', label: 'Event Hub', icon: Workflow, hint: 'Streams integration' },
  { id: 'uc5', label: 'CQRS Read Models', icon: Layers, hint: 'Microservices reads' },
  { id: 'uc6', label: 'Real-time Fraud', icon: ShieldAlert, hint: 'Velocity & limits' },
  { id: 'uc7', label: 'Reconciliation', icon: CheckCheck, hint: 'Switch ⇆ CBS' },
];

const ALL_EVENTS = [
  'metrics',
  'inspect',
  'rdi:event',
  'rdi:status',
  'uc1:sync',
  'uc2:session',
  'uc3:token',
  'uc4:publish',
  'uc4:consume',
  'uc5:command',
  'uc5:cdc',
  'uc6:decision',
  'uc7:matched',
  'uc7:exception',
  'bench:result',
];

export default function App() {
  const [active, setActive] = useState('uc1');
  const [health, setHealth] = useState(null);
  const { events, latest } = useSSE(ALL_EVENTS);

  useEffect(() => {
    api
      .get('/api/health')
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
  }, []);

  const Panel = {
    uc1: UC1Customer360,
    uc2: UC2Sessions,
    uc3: UC3OpenBanking,
    uc4: UC4EventHub,
    uc5: UC5CQRS,
    uc6: UC6Fraud,
    uc7: UC7Reconciliation,
  }[active];

  const activeNav = NAV.find((n) => n.id === active);

  return (
    <div className="min-h-screen flex flex-col">
      <Header health={health} rdi={latest['rdi:status']} />
      <div className="flex-1 grid grid-cols-12 gap-4 px-6 py-4">
        <Sidebar active={active} onSelect={setActive} />
        <main className="col-span-10 min-w-0 space-y-1">
          <Breadcrumb activeNav={activeNav} />
          <Panel events={events} latest={latest} />
        </main>
      </div>
      <Footer />
    </div>
  );
}

function Header({ health, rdi }) {
  return (
    <header className="px-6 py-4 border-b border-white/5 backdrop-blur bg-black/20 sticky top-0 z-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-redis-hyper to-[#c52f25] grid place-items-center text-white font-display font-bold text-lg shadow-[0_8px_20px_-6px_rgba(255,68,56,0.6)]">
              R
            </div>
            <div className="absolute -inset-0.5 rounded-xl border border-redis-hyper/30 pointer-events-none" />
          </div>
          <div>
            <div className="font-display text-[17px] leading-tight tracking-tight">
              Redis Enterprise · <span className="text-gradient-hyper">Core Banking</span>
            </div>
            <div className="text-[10.5px] text-redis-warm/45 tilt-tag mt-1">
              Real-time data layer · TCS BaNCS · Finacle · Flexcube
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={health?.ok ? 'mint' : 'red'} size="md">
            <Activity size={11} />
            {health?.ok ? 'Cluster online' : 'Cluster offline'}
          </Pill>
          <Pill tone="lavender" size="md">
            <Database size={11} /> Postgres 16
          </Pill>
          <Pill tone={rdi?.status === 'running' ? 'red' : 'slate'} size="md">
            <span
              className={`w-1.5 h-1.5 rounded-full ${rdi?.status === 'running' ? 'bg-redis-hyper animate-pulse' : 'bg-redis-warm/40'}`}
            />
            RDI {rdi?.status === 'running' ? 'streaming' : 'starting'}
          </Pill>
        </div>
      </div>
    </header>
  );
}

function Breadcrumb({ activeNav }) {
  if (!activeNav) return null;
  const Icon = activeNav.icon;
  return (
    <div className="flex items-center gap-2 text-[11px] text-redis-warm/40 mb-3">
      <span className="tilt-tag">Demo</span>
      <ChevronRight size={11} />
      <span>Use cases</span>
      <ChevronRight size={11} />
      <span className="text-redis-warm/80 inline-flex items-center gap-1.5">
        <Icon size={11} className="text-redis-hyper" /> {activeNav.label}
      </span>
    </div>
  );
}

function Sidebar({ active, onSelect }) {
  return (
    <nav className="col-span-2 min-w-0">
      <div className="rounded-2xl glass p-2.5 sticky top-[88px]">
        <div className="tilt-tag text-redis-warm/40 px-3 py-2.5">Use cases</div>
        <div className="space-y-1">
          {NAV.map((n, i) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center gap-2.5 border transition-all relative ${
                  isActive
                    ? 'bg-gradient-to-r from-redis-hyper/15 to-redis-hyper/5 border-redis-hyper/40 text-redis-warm shadow-[inset_0_0_0_1px_rgba(255,68,56,0.1)]'
                    : 'border-transparent hover:bg-white/[0.04] text-redis-warm/70'
                }`}
              >
                <span
                  className={`shrink-0 w-7 h-7 rounded-lg grid place-items-center text-[11px] font-display font-bold transition-all ${
                    isActive
                      ? 'bg-redis-hyper text-white shadow-[0_4px_12px_-2px_rgba(255,68,56,0.6)]'
                      : 'bg-white/5 text-redis-warm/55'
                  }`}
                >
                  {i + 1}
                </span>
                <Icon
                  size={15}
                  className={isActive ? 'text-redis-hyper' : 'text-redis-warm/60'}
                  strokeWidth={1.7}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] leading-tight truncate font-medium">{n.label}</div>
                  <div className="text-[10px] text-redis-warm/40 mt-0.5 truncate">{n.hint}</div>
                </div>
                {isActive && <div className="w-1 h-1 rounded-full bg-redis-hyper" />}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="px-6 py-3 text-[10.5px] text-redis-warm/35 border-t border-white/5 flex items-center justify-between">
      <span>
        Redis Enterprise · Core Banking Modernization Demo · Use cases 1–7 · CBS = system of record
        · Redis = system of engagement
      </span>
      <span className="code">v1.0 · benchmarks measured against Postgres 16</span>
    </footer>
  );
}
