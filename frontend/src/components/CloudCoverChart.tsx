import { useMemo } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

import type { CloudCover, Resolution } from "../lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

// Match the app's grotesk UI font so chart labels stay consistent.
ChartJS.defaults.font.family =
  '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';

export type CloudSeries = {
  param: number;
  label: string;
  unit: string; // "percent" | "octas" — shown in the legend label
  axis: "yPercent" | "yOctas"; // which Y-axis this series draws against
  color: string;
  data: CloudCover;
};

type Props = {
  series: CloudSeries[];
  resolution: Resolution;
};

function formatLabel(tsMs: number, resolution: Resolution): string {
  const d = new Date(tsMs);
  if (resolution === "monthly") {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  if (resolution === "daily") {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    timeZone: "UTC",
  });
}

export function CloudCoverChart({ series, resolution }: Props) {
  // The two series may come from different stations with different timestamps,
  // so build one sorted union of all bucket timestamps and align each series to
  // it (null where a series has no sample at that timestamp).
  const timeline = useMemo(() => {
    const all = new Set<number>();
    for (const s of series) for (const p of s.data.points) all.add(p.ts);
    return [...all].sort((a, b) => a - b);
  }, [series]);

  const chartData = useMemo(
    () => ({
      labels: timeline.map((ts) => formatLabel(ts, resolution)),
      datasets: series.map((s) => {
        const byTs = new Map(s.data.points.map((p) => [p.ts, p.value]));
        return {
          label: `${s.label} (${s.unit})`,
          data: timeline.map((ts) => (byTs.has(ts) ? byTs.get(ts)! : null)),
          borderColor: s.color,
          backgroundColor: s.color,
          yAxisID: s.axis,
          spanGaps: false, // leave a gap where value is null (no usable data)
          pointRadius: resolution === "hourly" ? 0 : 2,
          tension: 0.2,
        };
      }),
    }),
    [series, timeline, resolution],
  );

  const hasPercent = series.some((s) => s.axis === "yPercent");
  const hasOctas = series.some((s) => s.axis === "yOctas");

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      scales: {
        yPercent: {
          type: "linear" as const,
          display: hasPercent,
          position: "left" as const,
          min: 0,
          max: 100,
          title: { display: true, text: "Total cloud (%)" },
        },
        yOctas: {
          type: "linear" as const,
          display: hasOctas,
          position: "right" as const,
          min: 0,
          max: 8,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Low cloud (octas)" },
        },
        x: {
          ticks: { maxTicksLimit: 8, autoSkip: true },
        },
      },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx: {
              dataset: { label?: string; yAxisID?: string };
              parsed: { y: number | null };
            }) => {
              const y = ctx.parsed.y;
              const name = ctx.dataset.label ?? "";
              if (y == null) return `${name}: no data`;
              const suffix = ctx.dataset.yAxisID === "yOctas" ? " octas" : "%";
              return `${name}: ${y}${suffix}`;
            },
          },
        },
      },
    }),
    [hasPercent, hasOctas],
  );

  return <Line data={chartData} options={options} />;
}
