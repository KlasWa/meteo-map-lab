import { useEffect, useRef, useState } from "react";

import { getLightningRisk } from "../lib/api";
import type { LightningRisk, LocationFactor } from "../lib/api";
import { formatPercent, formatReturnPeriod } from "../lib/risk-format";
import {
  setFactor,
  setHeight,
  setLength,
  setLineLength,
  setWidth,
  useRiskInputs,
} from "../lib/riskInputs";

const LOCATION_OPTIONS: { value: LocationFactor; label: string }[] = [
  { value: 0.25, label: "Surrounded by taller objects / trees" },
  { value: 0.5, label: "Surrounded by objects of equal/lower height" },
  { value: 1, label: "Isolated (no nearby objects)" },
  { value: 2, label: "Isolated on a hilltop / promontory" },
];

export function RiskPanel({
  lat,
  lon,
  measuring,
  onToggleMeasure,
}: {
  lat: number;
  lon: number;
  measuring: boolean;
  onToggleMeasure: () => void;
}) {
  const { length, width, height, lineLength, factor, measureFlashTick } =
    useRiskInputs();
  const [result, setResult] = useState<LightningRisk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashMeasuredDims, setFlashMeasuredDims] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (measureFlashTick === 0) return;
    setFlashMeasuredDims(false);
    const raf = requestAnimationFrame(() => setFlashMeasuredDims(true));
    const done = window.setTimeout(() => setFlashMeasuredDims(false), 850);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [measureFlashTick]);

  useEffect(() => {
    if (result) {
      resultRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [result]);

  // The computed result is specific to lat/lon; clear it on a location switch so
  // a stale number is never shown for a new spot. Adjusting state during render
  // (the React-recommended "reset on prop change" pattern) keeps the inputs,
  // which live in the store, untouched. See react.dev "You Might Not Need an Effect".
  const [resultLoc, setResultLoc] = useState({ lat, lon });
  if (resultLoc.lat !== lat || resultLoc.lon !== lon) {
    setResultLoc({ lat, lon });
    setResult(null);
    setError(null);
  }

  const calculate = async () => {
    const lengthNum = Number(length);
    const widthNum = Number(width);
    const heightNum = Number(height);
    if (!(lengthNum > 0) || !(widthNum > 0) || !(heightNum > 0)) {
      setError("Enter positive length, width, and height.");
      setResult(null);
      return;
    }
    const lineNum = lineLength.trim() === "" ? undefined : Number(lineLength);
    if (lineNum !== undefined && !(lineNum > 0)) {
      setError("Line length must be a positive number, or left blank.");
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await getLightningRisk({
        lat,
        lon,
        length_m: lengthNum,
        width_m: widthNum,
        height_m: heightNum,
        location_factor: factor,
        line_length_m: lineNum,
      });
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "failed");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-compact min-w-0 overflow-hidden border border-base-300 bg-base-100">
      <div className="card-body gap-2 p-3">
        <h3 className="text-xs font-semibold opacity-70">
          Strike risk (IEC 62305)
        </h3>
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 [&>*]:min-w-0">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="label-text text-[0.7rem]">Length (m)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={`input input-bordered input-xs w-full${flashMeasuredDims ? " animate-measure-input-flash" : ""}`}
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="label-text text-[0.7rem]">Width (m)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={`input input-bordered input-xs w-full${flashMeasuredDims ? " animate-measure-input-flash" : ""}`}
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="label-text text-[0.7rem]">Height (m)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input input-bordered input-xs w-full"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </label>
            </div>

            <button
              type="button"
              className={`btn btn-xs h-auto min-h-8 whitespace-normal text-left ${measuring ? "btn-warning" : "btn-ligth"}`}
              onClick={onToggleMeasure}
            >
              {measuring
                ? "Measuring… tap three corners: two along one side, then the opposite side (tap again to cancel)"
                : "Measure on map"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 [&>*]:min-w-0">
            {/* `flex flex-col` is explicit because daisyUI 5 dropped the
                form-control utility that previously stacked label-text above
                its control. Without it, `<select>` would render inline with
                its sibling span. */}
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label-text text-[0.7rem]">Surroundings</span>
              <select
                className="select select-bordered select-xs w-full min-w-0 max-w-full"
                value={factor}
                onChange={(e) =>
                  setFactor(Number(e.target.value) as LocationFactor)
                }
              >
                {LOCATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="label-text text-[0.7rem]">
                Incoming line length (m, optional)
              </span>
              <input
                type="number"
                min="0"
                step="any"
                className="input input-bordered input-xs w-full"
                value={lineLength}
                onChange={(e) => setLineLength(e.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-2 mt-4">
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => void calculate()}
              disabled={busy}
            >
              {busy ? "Calculating…" : "Calculate"}
            </button>

            {error && <p className="text-xs text-error">{error}</p>}

            {result && (
              <div
                ref={resultRef}
                className="rounded-box border border-base-300 p-2 text-xs space-y-1"
              >
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <span className="min-w-0 font-semibold">
                    Annual chance of a direct strike
                  </span>
                  <span className="shrink-0 text-base font-bold">
                    {formatPercent(result.annual_probability)}
                  </span>
                </div>
                <div className="opacity-70">
                  {formatReturnPeriod(result.return_period_years ?? null)}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="badge badge-sm">{result.hazard_band}</span>
                  <span className="min-w-0 opacity-50">
                    heuristic, not an IEC verdict
                  </span>
                </div>
                <hr className="border-base-300" />
                <p className="opacity-70">
                  Expected direct strikes/yr:{" "}
                  {result.expected_direct_per_year.toExponential(2)}
                </p>
                <p className="opacity-70">
                  Local ground flash density: {result.n_g.toFixed(3)}{" "}
                  flashes/km²/yr ({result.ground_flash_count} ground of{" "}
                  {result.total_flash_count} within {result.radius_km} km, over{" "}
                  {result.span_years} yr)
                </p>
                {result.expected_line_per_year != null && (
                  <p className="opacity-70">
                    Strikes/yr to incoming line:{" "}
                    {result.expected_line_per_year.toExponential(2)}
                  </p>
                )}
                {result.stale && (
                  <span className="badge badge-warning badge-sm">
                    showing cached data
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
