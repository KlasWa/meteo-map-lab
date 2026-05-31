import { useMemo } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
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
  Filler,
  Title,
  Tooltip,
  Legend,
);

type Props = {
  data: CloudCover;
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

export function CloudCoverChart({ data, resolution }: Props) {
  const chartData = useMemo(
    () => ({
      labels: data.points.map((p) => formatLabel(p.ts, resolution)),
      datasets: [
        {
          label: "Cloud cover (%)",
          data: data.points.map((p) => p.value),
          borderColor: "oklch(60% 0.13 250)",
          backgroundColor: "oklch(60% 0.13 250 / 0.15)",
          fill: true,
          spanGaps: false, // leave a gap where value is null (no usable data)
          pointRadius: resolution === "hourly" ? 0 : 2,
          tension: 0.2,
        },
      ],
    }),
    [data, resolution],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      scales: {
        y: {
          min: 0,
          max: 100,
          title: { display: true, text: "Cloud cover (%)" },
        },
        x: {
          ticks: { maxTicksLimit: 8, autoSkip: true },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { y: number | null } }) =>
              ctx.parsed.y == null ? "no data" : `${ctx.parsed.y}%`,
          },
        },
      },
    }),
    [],
  );

  return <Line data={chartData} options={options} />;
}
