import React from 'react';

export function Card({ title, subtitle, right, children, className = '', accent = false, padded = true }) {
  return (
    <div
      className={`relative rounded-2xl glass ${accent ? 'gradient-border' : ''} ${className}`}
    >
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <div className="tilt-tag text-redis-warm/70 truncate">{title}</div>}
            {subtitle && (
              <div className="text-[12.5px] text-redis-warm/45 mt-1 leading-snug">
                {subtitle}
              </div>
            )}
          </div>
          <div className="shrink-0">{right}</div>
        </div>
      )}
      {(title || right) && <div className="divider-soft mx-5" />}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}

export function Pill({ children, tone = 'default', className = '', size = 'md' }) {
  const map = {
    default: 'bg-white/5 text-redis-warm/80 border-white/10',
    red: 'bg-redis-hyper/15 text-redis-hyper border-redis-hyper/40',
    yellow: 'bg-redis-yellow/12 text-redis-yellow border-redis-yellow/35',
    mint: 'bg-redis-mint/15 text-redis-mint border-redis-mint/35',
    lavender: 'bg-redis-lavender/15 text-redis-lavender border-redis-lavender/40',
    slate: 'bg-white/5 text-redis-warm/65 border-white/10',
    success: 'bg-redis-mint/15 text-redis-mint border-redis-mint/40',
    danger: 'bg-redis-hyper/15 text-redis-hyper border-redis-hyper/45',
  };
  const sizes = {
    sm: 'px-2 py-[2px] text-[10px]',
    md: 'px-2.5 py-[3px] text-[11px]',
    lg: 'px-3 py-1 text-xs',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${map[tone]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({ children, tone = 'primary', size = 'md', className = '', ...rest }) {
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3.5 py-2 text-sm',
    lg: 'px-4 py-2.5 text-sm',
  };
  const map = {
    primary:
      'bg-redis-hyper hover:bg-redis-hyper/90 text-white shadow-[0_8px_22px_-10px_rgba(255,68,56,0.7)] border-transparent',
    ghost:
      'bg-transparent border-white/15 hover:border-redis-hyper/55 hover:text-redis-hyper text-redis-warm/85',
    soft: 'bg-white/5 border-white/10 hover:bg-white/10 text-redis-warm',
    danger:
      'bg-transparent border-redis-hyper/40 text-redis-hyper hover:bg-redis-hyper/10',
  };
  return (
    <button
      className={`rounded-lg font-medium border transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 ${sizes[size]} ${map[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export const Input = React.forwardRef(function Input({ className = '', ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`bg-redis-midnight/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-redis-warm placeholder:text-redis-warm/30 outline-none focus:border-redis-hyper/55 focus:ring-2 focus:ring-redis-hyper/15 transition-all ${className}`}
    />
  );
});

export function Select({ className = '', ...rest }) {
  return (
    <select
      {...rest}
      className={`bg-redis-midnight/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-redis-warm outline-none focus:border-redis-hyper/55 focus:ring-2 focus:ring-redis-hyper/15 transition-all ${className}`}
    />
  );
}

export function Stat({ label, value, hint, tone = 'default', icon: Icon, trend, accent = false }) {
  const colorMap = {
    default: 'text-redis-warm',
    red: 'text-redis-hyper',
    mint: 'text-redis-mint',
    yellow: 'text-redis-yellow',
    lavender: 'text-redis-lavender',
  };
  const glowMap = {
    default: '',
    red: 'shadow-[0_8px_28px_-18px_rgba(255,68,56,0.55)]',
    mint: 'shadow-[0_8px_28px_-18px_rgba(128,219,196,0.4)]',
    yellow: 'shadow-[0_8px_28px_-18px_rgba(255,233,166,0.35)]',
    lavender: 'shadow-[0_8px_28px_-18px_rgba(199,149,227,0.45)]',
  };
  return (
    <div
      className={`relative rounded-xl glass px-4 py-3 overflow-hidden group transition-all hover:-translate-y-[1px] ${glowMap[tone]} ${accent ? 'gradient-border' : ''}`}
    >
      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top right, rgba(255,68,56,0.08), transparent 60%)',
        }}
      />
      <div className="flex items-center justify-between">
        <div className="tilt-tag text-redis-warm/45">{label}</div>
        {Icon && (
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border ${
              tone === 'red'
                ? 'bg-redis-hyper/12 border-redis-hyper/30 text-redis-hyper'
                : tone === 'mint'
                  ? 'bg-redis-mint/10 border-redis-mint/25 text-redis-mint'
                  : tone === 'yellow'
                    ? 'bg-redis-yellow/10 border-redis-yellow/25 text-redis-yellow'
                    : tone === 'lavender'
                      ? 'bg-redis-lavender/10 border-redis-lavender/25 text-redis-lavender'
                      : 'bg-white/5 border-white/10 text-redis-warm/55'
            }`}
          >
            <Icon size={12} strokeWidth={1.9} />
          </span>
        )}
      </div>
      <div className={`mt-1 font-display text-[22px] font-semibold leading-tight ${colorMap[tone]}`}>
        {value}
      </div>
      {hint && (
        <div className="text-[10.5px] text-redis-warm/40 mt-0.5 truncate code">{hint}</div>
      )}
      {trend != null && (
        <div className="mt-1.5">
          <Sparkline values={trend} color={
            tone === 'red' ? '#FF4438' :
            tone === 'mint' ? '#80DBC4' :
            tone === 'yellow' ? '#FFE9A6' :
            tone === 'lavender' ? '#C795E3' : '#7a8ed1'
          } height={14} fill={false} />
        </div>
      )}
    </div>
  );
}

export function Code({ children, className = '' }) {
  return (
    <pre
      className={`code text-[11.5px] leading-relaxed text-redis-mint/95 bg-black/35 border border-white/5 rounded-lg p-3 overflow-auto ${className}`}
    >
      {children}
    </pre>
  );
}

export function SectionHeader({ icon: Icon, title, description, badges = [], outcomes }) {
  return (
    <div className="flex items-start gap-4 mb-5 fadein">
      <div className="relative rounded-xl bg-redis-hyper/12 border border-redis-hyper/35 p-3 text-redis-hyper">
        {Icon ? <Icon size={22} strokeWidth={1.8} /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display text-[22px] text-redis-warm leading-tight">{title}</h2>
          {badges.map((b, i) => (
            <Pill key={i} tone={b.tone}>
              {b.label}
            </Pill>
          ))}
        </div>
        <p className="text-[13.5px] text-redis-warm/55 max-w-3xl mt-1.5 leading-relaxed">
          {description}
        </p>
        {outcomes && outcomes.length > 0 && (
          <div className="mt-3 rounded-xl border border-redis-hyper/25 bg-gradient-to-br from-redis-hyper/[0.07] via-redis-hyper/[0.02] to-transparent p-3 max-w-3xl">
            <div className="tilt-tag text-redis-hyper mb-1.5 flex items-center gap-1.5">
              <span className="inline-flex w-3.5 h-3.5 rounded-full bg-redis-hyper/15 border border-redis-hyper/35 items-center justify-center">
                <span className="w-1 h-1 rounded-full bg-redis-hyper" />
              </span>
              Business outcome
            </div>
            <ul className="space-y-1">
              {outcomes.map((o, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[12.5px] text-redis-warm/85 leading-snug"
                >
                  <span className="mt-[6px] w-1 h-1 rounded-full bg-redis-hyper shrink-0" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function NodeBox({ x, y, label, sub, tone = 'default', w = 130, h = 50 }) {
  const fills = {
    default: { fill: '#0c1c28', stroke: '#1f3445', text: '#FBF7F1' },
    pg: { fill: '#1c2942', stroke: '#3a558b', text: '#cdd9ff' },
    redis: { fill: '#FF4438', stroke: 'transparent', text: '#0a141a' },
    rdi: { fill: '#15243a', stroke: '#7a86c5', text: '#cdd9ff' },
    mint: { fill: '#103330', stroke: '#2c6e60', text: '#80DBC4' },
  };
  const f = fills[tone] || fills.default;
  return (
    <g>
      <rect x={x} y={y} rx={10} width={w} height={h} fill={f.fill} stroke={f.stroke} strokeWidth="1" />
      <text x={x + w / 2} y={y + (sub ? 22 : 30)} textAnchor="middle" fontSize="12" fontFamily="Space Grotesk, sans-serif" fontWeight="600" fill={f.text}>
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + 36} textAnchor="middle" fontSize="9.5" fill={f.text} opacity="0.7">
          {sub}
        </text>
      )}
    </g>
  );
}

export function FlowDiagram({ nodes, edges, height = 200, width = 740 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <defs>
        <marker id="arrowred" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#FF4438" />
        </marker>
        <marker id="arrowmute" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#3a516a" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = nodes.find((n) => n.id === e.from);
        const b = nodes.find((n) => n.id === e.to);
        if (!a || !b) return null;
        const aw = a.w || 130;
        const bw = b.w || 130;
        const ah = a.h || 50;
        const bh = b.h || 50;
        const x1 = a.x + aw;
        const y1 = a.y + ah / 2;
        const x2 = b.x;
        const y2 = b.y + bh / 2;
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={e.active ? '#FF4438' : '#3a516a'}
              strokeWidth={e.active ? 1.8 : 1.2}
              className={e.active ? 'flow-edge' : ''}
              markerEnd={e.active ? 'url(#arrowred)' : 'url(#arrowmute)'}
              opacity={e.active ? 0.9 : 0.6}
            />
            {e.label && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 6}
                fontSize="10"
                fill="#FBF7F1"
                opacity="0.7"
                textAnchor="middle"
                fontFamily="Space Mono, monospace"
              >
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {nodes.map((n) => (
        <NodeBox key={n.id} {...n} />
      ))}
    </svg>
  );
}

export function MiniBars({ samples = [], color = '#FF4438', height = 40, max }) {
  if (samples.length === 0) {
    return <div style={{ height }} className="text-[11px] text-redis-warm/30 flex items-center">no samples yet</div>;
  }
  const m = max || Math.max(...samples) * 1.1;
  return (
    <svg viewBox={`0 0 ${samples.length * 4} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {samples.map((v, i) => {
        const h = Math.max(1, (v / m) * height);
        return <rect key={i} x={i * 4} y={height - h} width={3} height={h} fill={color} opacity={0.85} rx={0.5} />;
      })}
    </svg>
  );
}

export function Sparkline({ values = [], color = '#FF4438', height = 36, fill = true }) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 1);
  const w = 200;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${height - (v / max) * height}`)
    .join(' ');
  const area = `0,${height} ${pts} ${w},${height}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {fill && <polygon points={area} fill={color} opacity="0.18" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function Histogram({ samples = [], color = '#FF4438', height = 70, bins = 16, label }) {
  if (samples.length === 0) {
    return (
      <div style={{ height }} className="rounded-lg bg-black/30 border border-white/5 flex items-center justify-center text-[11px] text-redis-warm/30">
        no samples yet
      </div>
    );
  }
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min || 1;
  const counts = new Array(bins).fill(0);
  for (const v of samples) {
    const idx = Math.min(bins - 1, Math.floor(((v - min) / span) * bins));
    counts[idx]++;
  }
  const peak = Math.max(...counts, 1);
  const barW = 100 / bins;
  return (
    <div className="rounded-lg bg-black/30 border border-white/5 p-2">
      {label && (
        <div className="text-[10px] text-redis-warm/40 mb-1 uppercase tracking-widest">
          {label}
        </div>
      )}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }}>
        {counts.map((c, i) => {
          const h = (c / peak) * 95;
          return (
            <rect
              key={i}
              x={i * barW + 0.3}
              y={100 - h}
              width={barW - 0.6}
              height={h}
              fill={color}
              opacity={0.85}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-redis-warm/35 code mt-1">
        <span>{min.toFixed(2)} ms</span>
        <span>{max.toFixed(2)} ms</span>
      </div>
    </div>
  );
}

export function RingGauge({
  value = 0,
  max = 100,
  size = 110,
  thickness = 9,
  color = '#FF4438',
  trackColor = 'rgba(255,255,255,0.08)',
  label,
  sub,
  tone = 'red',
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const dash = c * pct;
  const colors = {
    red: '#FF4438',
    mint: '#80DBC4',
    yellow: '#FFE9A6',
    lavender: '#C795E3',
  };
  const stroke = colors[tone] || color;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={thickness} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={stroke}
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <div className="font-display text-[20px] font-bold text-redis-warm leading-none">{label}</div>}
        {sub && <div className="text-[10px] text-redis-warm/45 mt-1 uppercase tracking-widest">{sub}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name = '', segment, size = 32 }) {
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const palette = {
    Wealth: ['#C795E3', 'rgba(199,149,227,0.16)', 'rgba(199,149,227,0.45)'],
    Priority: ['#FFE9A6', 'rgba(255,233,166,0.16)', 'rgba(255,233,166,0.4)'],
    Retail: ['#80DBC4', 'rgba(128,219,196,0.16)', 'rgba(128,219,196,0.4)'],
  };
  const [fg, bg, border] = palette[segment] || ['#FBF7F1', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.1)'];
  return (
    <div
      className="rounded-full inline-flex items-center justify-center font-display font-semibold flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initials || '?'}
    </div>
  );
}

export function Bar({ value = 0, max = 100, color = '#FF4438', height = 6, track = 'rgba(255,255,255,0.07)', radius = 4 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ background: track, height, borderRadius: radius }} className="w-full overflow-hidden">
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: radius,
          transition: 'width 400ms ease',
        }}
      />
    </div>
  );
}

export function Empty({ icon: Icon, message, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center text-redis-warm/45">
      {Icon && <Icon size={26} strokeWidth={1.4} className="opacity-50 mb-2" />}
      <div className="text-[13px] text-redis-warm/65">{message}</div>
      {hint && <div className="text-[11.5px] mt-1 text-redis-warm/40 max-w-xs">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function KV({ k, v, accent = false, mono = false, className = '' }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-1.5 rounded-md ${
        accent ? 'bg-redis-hyper/8 border border-redis-hyper/20' : 'bg-white/[0.025] border border-white/5'
      } ${className}`}
    >
      <span className="text-[11px] text-redis-warm/45 uppercase tracking-wider">{k}</span>
      <span className={`text-[12px] ${accent ? 'text-redis-hyper' : 'text-redis-warm'} ${mono ? 'code' : ''} truncate`}>{v}</span>
    </div>
  );
}
