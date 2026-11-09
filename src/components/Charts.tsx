import { formatCurrency, formatNumber } from '@/lib/format';

// Simple bar chart using SVG — Purple & Gold accents
interface BarChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  valueFormatter?: (v: number) => string;
}

export function BarChart({ data, color = '#6D28D9', height = 200, valueFormatter = formatCurrency }: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex items-end justify-between gap-2 h-full">
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          const isPeak = d.value === max;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
              <div className="relative w-full flex justify-center flex-1 items-end">
                <div
                  className="w-full max-w-[48px] rounded-t-lg transition-all duration-500 hover:opacity-90 relative"
                  style={{
                    height: `${Math.max(h, 2)}%`,
                    background: isPeak
                      ? 'linear-gradient(to top, #B8862D, #D4A24C)'
                      : `linear-gradient(to top, ${color}, #7C3AED)`,
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[10px] font-bold text-[#1F2937] bg-white border border-[#E5E7EB] px-2 py-1 rounded-md shadow-soft">
                    {valueFormatter(d.value)}
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[#4B5563] mt-2 truncate w-full text-center">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}

export function LineChart({ data, color = '#6D28D9', height = 200 }: LineChartProps) {
  if (data.length < 2) {
    return <BarChart data={data} color={color} height={height} />;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const width = 100;
  const step = width / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * step;
    const y = 100 - ((d.value - min) / range) * 90 - 5;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${width} 100 L 0 100 Z`;

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor="#D4A24C" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1.5"
            fill={i === points.length - 1 ? '#D4A24C' : color}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex justify-between mt-2">
        {data.map((d, i) => (
          <span key={i} className="text-[11px] font-medium text-[#4B5563]">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export function DonutChart({ data, size = 180 }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#F3F4F6" strokeWidth="12" />
        {data.map((d, i) => {
          const fraction = d.value / total;
          const dash = fraction * circumference;
          const segment = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return segment;
        })}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          className="rotate-90"
          style={{ transformOrigin: 'center', font: '700 11px sans-serif', fill: '#1F2937' }}
          transform="rotate(90 50 50)"
        >
          {formatNumber(total)}
        </text>
      </svg>
      <div className="space-y-2 flex-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
            <span className="text-[#4B5563] flex-1 truncate">{d.label}</span>
            <span className="font-bold text-[#111827]">{formatCurrency(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
