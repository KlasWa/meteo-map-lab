import type { Lightning, Resolution } from "./api";

type Point = Lightning["points"][number];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Server bucket keys are UTC-aligned; epoch 0 is a UTC hour/day boundary, so a
// modulo floors to the same key. Months vary in length, so step the calendar.
function bucketStart(ts: number, resolution: Resolution): number {
  if (resolution === "monthly") {
    const d = new Date(ts);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  const step = resolution === "hourly" ? HOUR_MS : DAY_MS;
  return ts - (ts % step);
}

function nextBucket(ts: number, resolution: Resolution): number {
  if (resolution === "monthly") {
    const d = new Date(ts);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return ts + (resolution === "hourly" ? HOUR_MS : DAY_MS);
}

/**
 * The backend returns only buckets that actually contain strikes. For a
 * continuous bar chart we want every hour/day/month in the visible window,
 * including the empty ones, so insert count:0 points for each bucket between
 * `from` and `to` (inclusive) that the data omits. `points` must be sorted
 * ascending. This is purely a rendering concern — no extra payload over the
 * wire.
 */
export function fillLightningGaps(
  points: Point[],
  resolution: Resolution,
  from: number,
  to: number,
): Point[] {
  const counts = new Map(
    points.map((p) => [bucketStart(p.ts, resolution), p.count]),
  );
  const out: Point[] = [];
  for (
    let k = bucketStart(from, resolution), end = bucketStart(to, resolution);
    k <= end;
    k = nextBucket(k, resolution)
  ) {
    out.push({ ts: k, count: counts.get(k) ?? 0 });
  }
  return out;
}
