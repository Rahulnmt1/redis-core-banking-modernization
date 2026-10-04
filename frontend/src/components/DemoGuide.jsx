import React from 'react';
import { Card, Pill } from './ui.jsx';
import { Sparkles, ListOrdered, ArrowRight } from 'lucide-react';

export default function DemoGuide({ overview, steps, badges = [] }) {
  return (
    <Card
      accent
      title="Demo guide"
      subtitle="What you'll see + the recommended click-path"
      right={
        <div className="flex gap-1">
          {badges.map((b, i) => (
            <Pill key={i} tone={b.tone} size="sm">
              {b.label}
            </Pill>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-5">
          <div className="tilt-tag text-redis-warm/45 mb-2 flex items-center gap-1.5">
            <Sparkles size={11} className="text-redis-hyper" /> What you'll see
          </div>
          <ul className="space-y-1.5">
            {overview.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-redis-warm/85 leading-snug">
                <span className="mt-[6px] w-1 h-1 rounded-full bg-redis-hyper shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-7">
          <div className="tilt-tag text-redis-warm/45 mb-2 flex items-center gap-1.5">
            <ListOrdered size={11} className="text-redis-hyper" /> Try it · in this order
          </div>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] px-2.5 py-1.5 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 w-5 h-5 rounded-md bg-redis-hyper/15 border border-redis-hyper/35 text-redis-hyper text-[10.5px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-5 text-[12px] text-redis-warm truncate">
                      {s.action}
                    </span>
                    <ArrowRight size={11} className="col-span-1 text-redis-warm/35 justify-self-center" />
                    <span className="col-span-6 text-[11.5px] text-redis-warm/65 truncate">
                      {s.expect}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}
