import type { LatLon } from "./url-state";

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// Metres per degree of latitude, using the same Earth radius as haversineMeters
// so the planar projection below stays consistent with great-circle distances.
const M_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

// A rotated rectangle from three points: `a`→`b` is one locked side (the
// baseline), and `c` sweeps the perpendicular width. The points are projected to
// local metres via an equirectangular approximation around `a` (accurate at
// building scale), the rectangle is built with planar vector maths, and the four
// corners are projected back to lat/lon. Length is the longer side, width the
// shorter (orientation does not affect the IEC collection area).
export function rotatedRectangle(
  a: LatLon,
  b: LatLon,
  c: LatLon,
): { corners: [LatLon, LatLon, LatLon, LatLon]; lengthM: number; widthM: number } {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  const toXY = (p: LatLon) => ({
    x: (p.lon - a.lon) * mPerDegLon,
    y: (p.lat - a.lat) * M_PER_DEG_LAT,
  });
  const toLatLon = (x: number, y: number): LatLon => ({
    lat: a.lat + y / M_PER_DEG_LAT,
    lon: a.lon + x / mPerDegLon,
  });

  const pa = toXY(a);
  const pb = toXY(b);
  const pc = toXY(c);
  const ux = pb.x - pa.x;
  const uy = pb.y - pa.y;
  const len = Math.hypot(ux, uy);

  // Perpendicular unit vector (baseline rotated 90°); zero offset if degenerate.
  const nx = len === 0 ? 0 : -uy / len;
  const ny = len === 0 ? 0 : ux / len;
  const w = (pc.x - pa.x) * nx + (pc.y - pa.y) * ny; // signed perpendicular distance

  const corners: [LatLon, LatLon, LatLon, LatLon] = [
    toLatLon(pa.x, pa.y),
    toLatLon(pb.x, pb.y),
    toLatLon(pb.x + nx * w, pb.y + ny * w),
    toLatLon(pa.x + nx * w, pa.y + ny * w),
  ];
  return {
    corners,
    lengthM: Math.max(len, Math.abs(w)),
    widthM: Math.min(len, Math.abs(w)),
  };
}
