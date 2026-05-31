import { useCallback, useEffect, useState } from "react";

import { CloudCoverChart } from "./components/CloudCoverChart";
import { MapView } from "./components/MapView";
import { getCloudCover, getHealth } from "./lib/api";
import type { CloudCover, Resolution } from "./lib/api";

const RESOLUTIONS: Resolution[] = ["hourly", "daily", "monthly"];

type Selection = { lat: number; lon: number };

export default function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resolution, setResolution] = useState<Resolution>("daily");
  const [data, setData] = useState<CloudCover | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  // Fetch whenever a location or the resolution changes.
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCloudCover(selection.lat, selection.lon, resolution)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, resolution]);

  const handleSelect = useCallback((lat: number, lon: number) => {
    setSelection({ lat, lon });
  }, []);

  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <MapView onSelect={handleSelect} />
      </div>

      <aside className="flex w-96 flex-col gap-4 overflow-y-auto bg-base-200 p-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">elvy-map</h1>
          <span
            className={`badge badge-sm ${
              backendOk === null
                ? "badge-ghost"
                : backendOk
                  ? "badge-success"
                  : "badge-error"
            }`}
          >
            {backendOk === null
              ? "checking…"
              : backendOk
                ? "backend ok"
                : "backend down"}
          </span>
        </header>

        {!selection ? (
          <p className="text-sm opacity-70">
            Search an address or click the map to see cloud coverage for the
            past year.
          </p>
        ) : (
          <>
            {data && (
              <div className="text-sm">
                <p className="font-semibold">{data.station.name}</p>
                <p className="opacity-70">
                  {data.station.distance_km} km from selection
                </p>
                {data.stale && (
                  <span className="badge badge-warning badge-sm mt-1">
                    showing cached data
                  </span>
                )}
              </div>
            )}

            <div role="tablist" className="tabs tabs-box">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r}
                  role="tab"
                  className={`tab ${r === resolution ? "tab-active" : ""}`}
                  onClick={() => setResolution(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="relative min-h-72 flex-1">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="loading loading-spinner loading-lg" />
                </div>
              )}
              {error && !loading && (
                <div role="alert" className="alert alert-error">
                  <span>{error}</span>
                </div>
              )}
              {!loading && !error && data && data.points.length === 0 && (
                <p className="text-sm opacity-70">
                  No cloud-cover data for this location and range.
                </p>
              )}
              {!loading && !error && data && data.points.length > 0 && (
                <CloudCoverChart data={data} resolution={resolution} />
              )}
            </div>

            {data && (
              <p className="text-xs opacity-50">{data.attribution}</p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
