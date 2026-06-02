import type { Resolution } from "./api";

// UTC time-axis label for a bucket timestamp, scaled to the resolution.
export function formatLabel(tsMs: number, resolution: Resolution): string {
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
