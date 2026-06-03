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

// The drawn box is axis-aligned in lng/lat. Length is the longer of its two
// sides, width the shorter (orientation does not affect the IEC collection area).
export function rectangleDimensions(
  a: LatLon,
  b: LatLon,
): { lengthM: number; widthM: number } {
  const midLat = (a.lat + b.lat) / 2;
  const ew = haversineMeters(midLat, a.lon, midLat, b.lon);
  const ns = haversineMeters(a.lat, a.lon, b.lat, a.lon);
  return { lengthM: Math.max(ew, ns), widthM: Math.min(ew, ns) };
}
