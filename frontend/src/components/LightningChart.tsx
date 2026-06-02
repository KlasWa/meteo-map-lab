import { useMemo } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

import type { Lightning, Resolution } from "../lib/api";
import { formatLabel } from "../lib/chart-format";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

type Props = {
  data: Lightning;
  resolution: Resolution;
  color: string;
};

export function LightningChart({ data, resolution, color }: Props) {
  const chartData = useMemo(
    () => ({
      labels: data.points.map((p) => formatLabel(p.ts, resolution)),
      datasets: [
        {
          label: "Lightning strikes",
          data: data.points.map((p) => p.count),
          backgroundColor: color,
        },
      ],
    }),
    [data, resolution, color],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          title: { display: true, text: "Strikes" },
          ticks: { precision: 0 },
        },
        x: { ticks: { maxTicksLimit: 8, autoSkip: true } },
      },
      plugins: { legend: { display: false } },
    }),
    [],
  );

  return <Bar data={chartData} options={options} />;
}
