import { useEffect, useRef, useState } from 'react';

export interface PricePoint {
  date: string;
  value: number;
}

interface PriceLineChartProps {
  points: PricePoint[];
  ariaLabel: string;
  /** Fixed pixel height of the chart (mobile-first: compact on every screen). */
  height?: number;
}

const PAD = { top: 12, right: 8, bottom: 18, left: 8 };

/**
 * Small single-series dollar-value line chart. Fills its container's WIDTH (via
 * a ResizeObserver so the viewBox matches the pixel box 1:1 — no distortion) at
 * a FIXED height, so it stays compact on desktop instead of ballooning with the
 * viewport. Callers must guard for at least 2 points.
 */
export default function PriceLineChart({ points, ariaLabel, height = 140 }: PriceLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return null;

  const W = width;
  const H = height;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div ref={containerRef} className="w-full">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        <path d={areaPath} fill="#3B82F6" fillOpacity={0.15} />
        <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={2.5} fill="#3B82F6">
            <title>{`${p.date}: $${p.value.toFixed(2)}`}</title>
          </circle>
        ))}
        {/* endpoint labels */}
        <text x={PAD.left} y={H - 4} className="fill-gray-500" fontSize={9}>{first.date.slice(5)}</text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-gray-500" fontSize={9}>{last.date.slice(5)}</text>
      </svg>
    </div>
  );
}
