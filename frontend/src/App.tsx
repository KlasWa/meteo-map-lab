import { useCallback, useEffect, useRef, useState } from "react";

import { CloudCoverChart } from "./components/CloudCoverChart";
import type { CloudSeries } from "./components/CloudCoverChart";
import { LightningChart } from "./components/LightningChart";
import { MapView } from "./components/MapView";
import { getCloudCover, getHealth, getLightning, purgeCache } from "./lib/api";
import type { CloudCover, CloudParam, Lightning, Resolution } from "./lib/api";
import { readLatLonFromUrl, writeLatLonToUrl } from "./lib/url-state";
import type { LatLon } from "./lib/url-state";

const RESOLUTIONS: Resolution[] = ["hourly", "daily", "monthly"];

const DAY_MS = 24 * 60 * 60 * 1000;

// Time-period (date range) options per resolution — only ranges that make sense
// for the bucket size are offered. The backend serves ~13 months, so these just
// filter the already-fetched points client-side (no refetch). `days: null` means
// show everything cached.
type Period = { label: string; days: number | null };
const PERIODS_BY_RESOLUTION: Record<Resolution, Period[]> = {
  hourly: [
    { label: "1D", days: 1 },
    { label: "1W", days: 7 },
    { label: "1M", days: 30 },
  ],
  daily: [
    { label: "1M", days: 30 },
    { label: "3M", days: 90 },
    { label: "6M", days: 180 },
    { label: "1Y", days: 365 },
  ],
  monthly: [
    { label: "6M", days: 180 },
    { label: "1Y", days: 365 },
    { label: "All", days: null },
  ],
};
const DEFAULT_PERIOD: Record<Resolution, string> = {
  hourly: "1W",
  daily: "3M",
  monthly: "1Y",
};

// Initial great-circle bearing (compass degrees, 0 = north, clockwise) from
// point 1 to point 2. Used to rotate the "direction to station" arrow.
function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1r = toRad(lat1);
  const lat2r = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x =
    Math.cos(lat1r) * Math.sin(lat2r) -
    Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

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
  const [periodLabel, setPeriodLabel] = useState<string>(
    DEFAULT_PERIOD.monthly,
  );
  const [results, setResults] = useState<Record<number, ParamResult>>({});
  const [lightning, setLightning] = useState<{
    data: Lightning | null;
    error: string | null;
  }>({ data: null, error: null });
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

  const loadCloud = useCallback(async (sel: LatLon, res: Resolution) => {
    const entries = await Promise.all(
      PARAMS.map(async (p): Promise<[number, ParamResult]> => {
        try {
          const data = await getCloudCover(sel.lat, sel.lon, res, p.id);
          return [p.id, { data, error: null }];
        } catch (e: unknown) {
          return [
            p.id,
            { data: null, error: e instanceof Error ? e.message : "failed" },
          ];
        }
      }),
    );
    return Object.fromEntries(entries) as Record<number, ParamResult>;
  }, []);

  const loadLightning = useCallback(
    async (
      sel: LatLon,
      res: Resolution,
    ): Promise<{ data: Lightning | null; error: string | null }> => {
      try {
        const data = await getLightning(sel.lat, sel.lon, res);
        return { data, error: null };
      } catch (e: unknown) {
        return { data: null, error: e instanceof Error ? e.message : "failed" };
      }
    },
    [],
  );

  // Fetch every parameter in parallel whenever location or resolution changes.
  // Each parameter resolves its own nearest station, so they settle
  // independently — one can fail (no nearby station) while the other renders.
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    Promise.all([
      loadCloud(selection, resolution),
      loadLightning(selection, resolution),
    ])
      .then(([cloudResults, lightningResult]) => {
        if (cancelled) return;
        setResults(cloudResults);
        setLightning(lightningResult);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, resolution, loadCloud, loadLightning]);

  const handleSelect = useCallback((lat: number, lon: number) => {
    setLoading(true);
    setResults({});
    setLightning({ data: null, error: null });
    setSelection({ lat, lon });
  }, []);

  const changeResolution = useCallback(
    (r: Resolution) => {
      if (r === resolution || !selection) return;
      setLoading(true);
      setResults({});
      setLightning({ data: null, error: null });
      setResolution(r);
      setPeriodLabel(DEFAULT_PERIOD[r]);
    },
    [resolution, selection],
  );

  const handleClear = useCallback(() => {
    setSelection(null);
    setResults({});
    setLightning({ data: null, error: null });
    setLoading(false);
  }, []);

  // A map click clears the current selection if one exists (toggle), otherwise
  // selects the clicked point. (Geocoding-search picks always select.)
  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      if (selection) handleClear();
      else handleSelect(lat, lon);
    },
    [selection, handleClear, handleSelect],
  );

  const [pendingScope, setPendingScope] = useState<
    "cloud" | "lightning" | null
  >(null);
  const [purging, setPurging] = useState<"cloud" | "lightning" | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const purgeModalRef = useRef<HTMLDialogElement>(null);

  const openPurge = useCallback((scope: "cloud" | "lightning") => {
    setPendingScope(scope);
    purgeModalRef.current?.showModal();
  }, []);

  const purgeAndRefetch = useCallback(
    async (scope: "cloud" | "lightning") => {
      if (!selection) return;
      setPurging(scope);
      setPurgeError(null);
      try {
        await purgeCache(scope);
        if (scope === "cloud") {
          setResults(await loadCloud(selection, resolution));
        } else {
          setLightning(await loadLightning(selection, resolution));
        }
      } catch (e: unknown) {
        setPurgeError(e instanceof Error ? e.message : "purge failed");
      } finally {
        setPurging(null);
      }
    },
    [selection, resolution, loadCloud, loadLightning],
  );

  // Filter the fetched points to the selected period. Window relative to the
  // most recent data point (avoids an impure Date.now() in render and tracks
  // the latest available data, which can lag "now"). Points are sorted ascending,
  // so each series' last point is its max timestamp.
  const lightningPts = lightning.data?.points ?? [];
  const latestTs = PARAMS.reduce(
    (max, p) => {
      const pts = results[p.id]?.data?.points;
      const last = pts && pts.length ? pts[pts.length - 1].ts : 0;
      return last > max ? last : max;
    },
    lightningPts.length ? lightningPts[lightningPts.length - 1].ts : 0,
  );
  const periodOptions = PERIODS_BY_RESOLUTION[resolution];
  const selectedDays = (
    periodOptions.find((p) => p.label === periodLabel) ?? periodOptions[0]
  ).days;
  const cutoff = selectedDays == null ? 0 : latestTs - selectedDays * DAY_MS;
  const lightningInWindow = lightningPts.filter((p) => p.ts >= cutoff);
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

  const anyStale =
    PARAMS.some((p) => results[p.id]?.data?.stale) ||
    Boolean(lightning.data?.stale);
  const attribution = PARAMS.map((p) => results[p.id]?.data?.attribution).find(
    Boolean,
  );

  const cloudBusy = loading || purging === "cloud";
  const lightningBusy = loading || purging === "lightning";

  const purgeButton = (scope: "cloud" | "lightning", label: string) => (
    <button
      type="button"
      onClick={() => openPurge(scope)}
      disabled={purging !== null}
      className="btn btn-ghost btn-xs btn-circle"
      aria-label={label}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      {/* Map: full width and ~30vh tall on mobile (on top), fills the left
          column on large screens. */}
      <div className="relative h-[30vh] w-full lg:h-auto lg:w-auto lg:flex-1">
        <MapView
          onSelect={handleSelect}
          onMapClick={handleMapClick}
          selected={selection}
        />
      </div>

      {/* Aside: below the map on mobile, on the right (sized to fit the chart)
          on large screens. Scrolls internally so it never exceeds the screen. */}
      <aside className="flex w-full flex-1 flex-col gap-4 overflow-y-auto border-t border-base-300 bg-base-200 p-4 lg:w-[640px] lg:max-w-full lg:flex-none lg:border-l lg:border-t-0">
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
                  <h2 className="card-title text-base opacity-60">
                    {selection.lat.toFixed(5)}, {selection.lon.toFixed(5)}
                  </h2>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="btn btn-ghost btn-xs btn-circle"
                    aria-label="Clear selection"
                  >
                    ✕
                  </button>
                </div>
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
                          <span className="flex items-center gap-1 opacity-70">
                            <span>
                              {res.data.station.name} (
                              {res.data.station.distance_km} km)
                            </span>
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3 w-3 shrink-0"
                              style={{
                                transform: `rotate(${bearingDeg(
                                  selection.lat,
                                  selection.lon,
                                  res.data.station.lat,
                                  res.data.station.lon,
                                )}deg)`,
                              }}
                              role="img"
                              aria-label="Direction to station"
                            >
                              <path
                                d="M12 2 L18 13 L13 13 L13 22 L11 22 L11 13 L6 13 Z"
                                fill="currentColor"
                              />
                            </svg>
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
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
              >
                {periodOptions.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold opacity-70">Cloud cover</h3>
              {purgeButton("cloud", "Purge & refresh cloud data")}
            </div>
            <div className="relative mx-auto aspect-[2/1] w-full max-w-[600px]">
              {cloudBusy && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="loading loading-spinner loading-lg" />
                </div>
              )}
              {!cloudBusy && series.length > 0 && (
                <CloudCoverChart series={series} resolution={resolution} />
              )}
              {!cloudBusy && series.length === 0 && (
                <p className="text-sm opacity-70">
                  No cloud-cover data for this location and range.
                </p>
              )}
            </div>

            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold opacity-70">
                  Lightning — strikes within {lightning.data?.radius_km ?? 50}{" "}
                  km
                </h3>
                {purgeButton("lightning", "Purge & refresh lightning data")}
              </div>
              <div className="relative mx-auto aspect-[3/1] w-full max-w-[600px]">
                {lightningBusy && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="loading loading-spinner loading-lg" />
                  </div>
                )}
                {!lightningBusy &&
                  lightning.data &&
                  lightningInWindow.length > 0 && (
                    <LightningChart
                      data={{ ...lightning.data, points: lightningInWindow }}
                      resolution={resolution}
                      color="oklch(57% 0.21 27)"
                    />
                  )}
                {!lightningBusy &&
                  lightning.data &&
                  lightningInWindow.length === 0 && (
                    <p className="text-sm opacity-70">
                      No lightning recorded in this period.
                    </p>
                  )}
                {!lightningBusy && !lightning.data && lightning.error && (
                  <p className="text-sm opacity-50">{lightning.error}</p>
                )}
              </div>
            </div>

            {attribution && <p className="text-xs opacity-50">{attribution}</p>}
            {purgeError && <p className="text-xs text-error">{purgeError}</p>}
          </>
        )}

        <dialog ref={purgeModalRef} className="modal">
          <div className="modal-box">
            <h3 className="text-base font-bold">
              Purge cached {pendingScope} data?
            </h3>
            <p className="py-2 text-sm opacity-70">
              This deletes the cached {pendingScope} data and re-fetches it from
              SMHI
              {pendingScope === "lightning"
                ? " (lightning is slow to refill)"
                : ""}
              .
            </p>
            <div className="modal-action">
              <form method="dialog">
                <button className="btn btn-ghost btn-sm">Cancel</button>
              </form>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  purgeModalRef.current?.close();
                  if (pendingScope) void purgeAndRefetch(pendingScope);
                }}
              >
                Purge &amp; refresh
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button aria-label="Close">close</button>
          </form>
        </dialog>

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
