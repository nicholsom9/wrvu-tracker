export default function BarChart({ series }: { series: { date: string; total: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.total));
  const width = 340;
  const height = 120;
  const barGap = 4;
  const barWidth = (width - barGap * (series.length - 1)) / series.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="bar-chart" role="img" aria-label="wRVU by day, last 14 days">
      {series.map((s, i) => {
        const barHeight = (s.total / max) * (height - 16);
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        const day = Number(s.date.slice(8, 10));
        return (
          <g key={s.date}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx={2} className="bar-chart-bar" />
            <text x={x + barWidth / 2} y={height + 12} textAnchor="middle" className="bar-chart-label">
              {day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
