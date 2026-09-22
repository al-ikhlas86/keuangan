import { useI18n } from '../contexts/I18nContext';
import { fmt, type Trend } from '../lib/format';

function fmtShort(n: number): string {
  if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'jt';
  if (n >= 1000) return Math.round(n / 1000) + 'rb';
  return String(Math.round(n));
}

// Mirror lineChart() (index.html:1415-1442).
export function LineChart({ trend, h = 180 }: { trend: Trend[]; h?: number }) {
  const { tt } = useI18n();
  const w = 600;
  const padL = 34, padR = 10, padT = 14, padB = 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const n = trend.length;
  if (n === 0) {
    return <div className="flex items-center justify-center text-[10px] text-gray-500" style={{ height: h }}>{tt('msg.belumAdaData')}</div>;
  }
  const max = Math.max(...trend.flatMap((t) => [t.masuk, t.keluar]), 0) * 1.15 || 1;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const xAt = (i: number) => padL + (n > 1 ? stepX * i : innerW / 2);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const lineFor = (key: 'masuk' | 'keluar') => trend.map((t, i) => `${xAt(i)},${yAt(t[key])}`).join(' ');
  const gridY = [0, 0.5, 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {gridY.map((f) => {
        const y = padT + innerH - innerH * f;
        return (
          <g key={f}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#334155" strokeWidth="1" strokeDasharray="3,3" />
            <text x={padL - 6} y={y + 3} fontSize="8" fill="#64748b" textAnchor="end">{fmtShort(max * f)}</text>
          </g>
        );
      })}
      <polyline points={lineFor('masuk')} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={lineFor('keluar')} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {trend.map((t, i) => (
        <circle key={'m' + i} cx={xAt(i)} cy={yAt(t.masuk)} r="3" fill="#10b981"><title>{t.label} - {tt('misc.pemasukanUpper')}: {fmt(t.masuk)}</title></circle>
      ))}
      {trend.map((t, i) => (
        <circle key={'k' + i} cx={xAt(i)} cy={yAt(t.keluar)} r="3" fill="#ef4444"><title>{t.label} - {tt('misc.pengeluaranUpper')}: {fmt(t.keluar)}</title></circle>
      ))}
      {trend.map((t, i) => (
        <text key={'x' + i} x={xAt(i)} y={h - 4} fontSize="9" fill="#64748b" textAnchor="middle">{t.label}</text>
      ))}
    </svg>
  );
}
