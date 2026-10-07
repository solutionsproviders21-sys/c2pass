import type { Skill } from '@c2pass/shared';
import { SKILL_META } from '@/lib/format';

/** Four-axis radar of progress towards C2 (0–100 per skill). */
export function SkillRadar({ values, size = 240 }: { values: Record<Skill, number>; size?: number }) {
  const skills: Skill[] = ['CO', 'CE', 'EO', 'EE'];
  const c = size / 2;
  const r = size / 2 - 34;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / skills.length - Math.PI / 2;
    return [c + Math.cos(a) * r * (v / 100), c + Math.sin(a) * r * (v / 100)] as const;
  };
  const poly = skills.map((s, i) => point(i, values[s] ?? 0).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[260px]" role="img" aria-label="Progression vers C2 par compétence">
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={skills.map((_, i) => point(i, v).join(',')).join(' ')} fill="none" stroke="#e2e8f0" strokeWidth={1} />
      ))}
      {skills.map((s, i) => {
        const [x, y] = point(i, 100);
        const [lx, ly] = point(i, 122);
        return (
          <g key={s}>
            <line x1={c} y1={c} x2={x} y2={y} stroke="#e2e8f0" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-navy-800 text-[11px] font-semibold">{s}</text>
          </g>
        );
      })}
      <polygon points={poly} fill="rgba(213,43,30,0.18)" stroke="#d52b1e" strokeWidth={2} />
      {skills.map((s, i) => {
        const [x, y] = point(i, values[s] ?? 0);
        return <circle key={s} cx={x} cy={y} r={3.5} fill={SKILL_META[s].color} />;
      })}
    </svg>
  );
}

/** Simple multi-series line chart (score history). Values are 0–100. */
export function LineChart({ series, labels, height = 220, target }: { series: { name: string; color: string; values: (number | null)[] }[]; labels: string[]; height?: number; target?: number }) {
  const w = 640;
  const pad = { l: 34, r: 12, t: 12, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length <= 1 ? iw / 2 : (iw * i) / (labels.length - 1));
  const y = (v: number) => pad.t + ih - (ih * v) / 100;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label="Évolution des scores">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#eef2f7" />
          <text x={pad.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[10px]">{v}</text>
        </g>
      ))}
      {target !== undefined && (
        <g>
          <line x1={pad.l} x2={w - pad.r} y1={y(target)} y2={y(target)} stroke="#e0a526" strokeDasharray="5 4" />
          <text x={w - pad.r} y={y(target) - 5} textAnchor="end" className="fill-[#9a6c0b] text-[10px] font-semibold">Objectif C2</text>
        </g>
      )}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">{l}</text>
      ))}
      {series.map((s) => {
        const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => !!p);
        return (
          <g key={s.name}>
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" />
            {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={3.2} fill="white" stroke={s.color} strokeWidth={2} />)}
          </g>
        );
      })}
    </svg>
  );
}

export function Ring({ value, size = 120, label }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 9;
  const len = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0" role="img" aria-label={`${value} %`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6edf6" strokeWidth={9} />
      {value > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#d52b1e" strokeWidth={9} strokeLinecap="round"
        strokeDasharray={`${(len * Math.min(100, value)) / 100} ${len}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-navy-900 text-[22px] font-bold">{value}%</text>
      {label && <text x="50%" y="66%" textAnchor="middle" className="fill-slate-500 text-[10px]">{label}</text>}
    </svg>
  );
}
