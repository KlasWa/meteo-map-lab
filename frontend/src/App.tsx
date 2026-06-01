import { useCallback, useEffect, useState } from "react";

import { CloudCoverChart } from "./components/CloudCoverChart";
import type { CloudSeries } from "./components/CloudCoverChart";
import { MapView } from "./components/MapView";
import { getCloudCover, getHealth } from "./lib/api";
import type { CloudCover, CloudParam, Resolution } from "./lib/api";
import { readLatLonFromUrl, writeLatLonToUrl } from "./lib/url-state";
import type { LatLon } from "./lib/url-state";

const RESOLUTIONS: Resolution[] = ["hourly", "daily", "monthly"];

// Time-period (date range) options. The backend serves ~13 months, so these
// just filter the already-fetched points client-side (no refetch). `months:
// null` means show everything cached.
const PERIODS: { label: string; months: number | null }[] = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "All", months: null },
];
const DAY_MS = 24 * 60 * 60 * 1000;

// The two SMHI parameters shown together. Param 16 (percent) and 29 (octas)
// have different units, so each maps to its own Y-axis in the chart.
const PARAMS: {
  id: CloudParam;
  label: string;
  color: string;
  axis: "yPercent" | "yOctas";
}[] = [
  {
    id: 16,
    label: "Total cloud cover",
    color: "oklch(25% 0 0)",
    axis: "yPercent",
  },
  {
    id: 29,
    label: "Low cloud amount",
    color: "oklch(57% 0.21 27)",
    axis: "yOctas",
  },
];

type ParamResult = { data: CloudCover | null; error: string | null };

export default function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  // Initialize from the URL so a reload (or shared link) restores the
  // selection (lazy initializer reads the URL once, not on every render).
  // Loading starts true in that case since the fetch effect fires immediately
  // — handlers set loading for subsequent picks/clicks.
  const [selection, setSelection] = useState<LatLon | null>(readLatLonFromUrl);
  const [resolution, setResolution] = useState<Resolution>("monthly");
  const [periodMonths, setPeriodMonths] = useState<number | null>(12);
  const [results, setResults] = useState<Record<number, ParamResult>>({});
  const [loading, setLoading] = useState(selection !== null);

  useEffect(() => {
    getHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  // Mirror the selection into the URL with replaceState so reloads/shares
  // restore it but the back button skips intermediate clicks.
  useEffect(() => {
    writeLatLonToUrl(selection);
  }, [selection]);

  // Fetch every parameter in parallel whenever location or resolution changes.
  // Each parameter resolves its own nearest station, so they settle
  // independently — one can fail (no nearby station) while the other renders.
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    Promise.all(
      PARAMS.map(async (p): Promise<[number, ParamResult]> => {
        try {
          const data = await getCloudCover(
            selection.lat,
            selection.lon,
            resolution,
            p.id,
          );
          return [p.id, { data, error: null }];
        } catch (e: unknown) {
          return [
            p.id,
            { data: null, error: e instanceof Error ? e.message : "failed" },
          ];
        }
      }),
    )
      .then((entries) => {
        if (!cancelled) setResults(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, resolution]);

  const handleSelect = useCallback((lat: number, lon: number) => {
    setLoading(true);
    setResults({});
    setSelection({ lat, lon });
  }, []);

  const changeResolution = useCallback(
    (r: Resolution) => {
      if (r === resolution || !selection) return;
      setLoading(true);
      setResults({});
      setResolution(r);
    },
    [resolution, selection],
  );

  const handleClear = useCallback(() => {
    setSelection(null);
    setResults({});
    setLoading(false);
  }, []);

  // Filter the fetched points to the selected period. Window relative to the
  // most recent data point (avoids an impure Date.now() in render and tracks
  // the latest available data, which can lag "now"). Points are sorted ascending,
  // so each series' last point is its max timestamp.
  const latestTs = PARAMS.reduce((max, p) => {
    const pts = results[p.id]?.data?.points;
    const last = pts && pts.length ? pts[pts.length - 1].ts : 0;
    return last > max ? last : max;
  }, 0);
  const cutoff =
    periodMonths == null ? 0 : latestTs - periodMonths * 30 * DAY_MS;
  const series: CloudSeries[] = PARAMS.flatMap((p) => {
    const res = results[p.id];
    if (!res?.data) return [];
    const points = res.data.points.filter((pt) => pt.ts >= cutoff);
    if (points.length === 0) return [];
    return [
      {
        param: p.id,
        label: res.data.station.name,
        unit: res.data.unit,
        axis: p.axis,
        color: p.color,
        data: { ...res.data, points },
      },
    ];
  });

  const anyStale = PARAMS.some((p) => results[p.id]?.data?.stale);
  const attribution = PARAMS.map((p) => results[p.id]?.data?.attribution).find(
    Boolean,
  );

  return (
    <div className="flex h-screen">
      <div className="relative flex-1">
        <MapView onSelect={handleSelect} selected={selection} />
      </div>

      <aside className="flex w-96 flex-col gap-4 overflow-y-auto border-l border-base-300 bg-base-200 p-4">
        {!selection ? (
          <div className="rounded-box border border-dashed border-base-300 p-4 text-sm opacity-70">
            Search an address or click anywhere on the map to compare total and
            low cloud cover for the past year.
          </div>
        ) : (
          <>
            <div className="card card-compact border border-base-300 bg-base-100">
              <div className="card-body gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="card-title text-base">Selected location</h2>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="btn btn-ghost btn-xs btn-circle"
                    aria-label="Clear selection"
                  >
                    ✕
                  </button>
                </div>
                <p className="font-mono text-xs opacity-60">
                  {selection.lat.toFixed(5)}, {selection.lon.toFixed(5)}
                </p>
                <div className="space-y-1">
                  {PARAMS.map((p) => {
                    const res = results[p.id];
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="font-semibold">{p.label}:</span>
                        {res?.data ? (
                          <span className="opacity-70">
                            {res.data.station.name} (
                            {res.data.station.distance_km} km)
                          </span>
                        ) : res?.error ? (
                          <span className="opacity-50">{res.error}</span>
                        ) : (
                          <span className="opacity-50">…</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {anyStale && (
                  <span className="badge badge-warning badge-sm self-start">
                    showing cached data
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div role="tablist" className="tabs tabs-border">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    role="tab"
                    className={`tab ${r === resolution ? "tab-active" : ""}`}
                    onClick={() => changeResolution(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <select
                className="select select-xs w-auto"
                aria-label="Time period"
                value={
                  PERIODS.find((p) => p.months === periodMonths)?.label ?? "1Y"
                }
                onChange={(e) => {
                  const p = PERIODS.find((x) => x.label === e.target.value);
                  if (p) setPeriodMonths(p.months);
                }}
              >
                {PERIODS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative min-h-72 flex-1">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="loading loading-spinner loading-lg" />
                </div>
              )}
              {!loading && series.length > 0 && (
                <CloudCoverChart series={series} resolution={resolution} />
              )}
              {!loading && series.length === 0 && (
                <p className="text-sm opacity-70">
                  No cloud-cover data for this location and range.
                </p>
              )}
            </div>

            {attribution && <p className="text-xs opacity-50">{attribution}</p>}
          </>
        )}

        <div className="justify-end flex items-center gap-1.5 text-xs opacity-60 mt-auto">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              backendOk === null
                ? "bg-base-content/40"
                : backendOk
                  ? "bg-success"
                  : "bg-error"
            }`}
          />
          <span>
            {backendOk === null
              ? "checking…"
              : backendOk
                ? "api operational"
                : "api unavailable"}
          </span>
        </div>
      </aside>
    </div>
  );
}
