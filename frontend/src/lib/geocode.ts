// Reverse geocoding via MapTiler. Returns the best-guess display name for a
// coordinate (or null if the lookup fails or the API has nothing useful at
// that point — e.g. middle of the ocean). The key is the same VITE_MAPTILER_KEY
// the map and search use.

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

type Feature = {
  place_name?: string;
  text?: string;
};

type GeocodingResponse = {
  features?: Feature[];
};

export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!apiKey) return null;

  const url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) return null;

  const data = (await resp.json()) as GeocodingResponse;
  const first = data.features?.[0];
  return first?.place_name ?? first?.text ?? null;
}
