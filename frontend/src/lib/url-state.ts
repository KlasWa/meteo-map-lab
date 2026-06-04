// Selection state lives in the URL so a reload (or shared link) restores the
// last picked coordinate. We use replaceState everywhere so map clicks and
// searches don't pollute the back-button history.

export type LatLon = { lat: number; lon: number };

const COORD_DECIMALS = 5; // ~1.1 m precision; keeps URLs short.

export function readLatLonFromUrl(): LatLon | null {
  const params = new URLSearchParams(window.location.search);
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  if (latRaw === null || lonRaw === null) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function writeLatLonToUrl(coord: LatLon | null) {
  const url = new URL(window.location.href);
  if (coord) {
    url.searchParams.set("lat", coord.lat.toFixed(COORD_DECIMALS));
    url.searchParams.set("lon", coord.lon.toFixed(COORD_DECIMALS));
  } else {
    url.searchParams.delete("lat");
    url.searchParams.delete("lon");
  }
  window.history.replaceState(null, "", url);
}
