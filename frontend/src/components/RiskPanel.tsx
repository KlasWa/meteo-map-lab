import { useState } from "react";

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

export function RiskPanel({ lat, lon }: { lat: number; lon: number }) {
  const { length, width, height, lineLength, factor } = useRiskInputs();
  const [result, setResult] = useState<LightningRisk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="collapse collapse-arrow border border-base-300 bg-base-100">
      <input type="checkbox" />
      <div className="collapse-title text-xs font-semibold opacity-70">
        Strike risk (IEC 62305)
      </div>
      <div className="collapse-content space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <label className="form-control">
            <span className="label-text text-[0.7rem]">Length (m)</span>
            <input
              type="number"
              min="0"
              step="any"
              className="input input-bordered input-xs"
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-[0.7rem]">Width (m)</span>
            <input
              type="number"
              min="0"
              step="any"
              className="input input-bordered input-xs"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-[0.7rem]">Height (m)</span>
            <input
              type="number"
              min="0"
              step="any"
              className="input input-bordered input-xs"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </label>
        </div>

        <label className="form-control">
          <span className="label-text text-[0.7rem]">Surroundings</span>
          <select
            className="select select-bordered select-xs"
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

        <label className="form-control">
          <span className="label-text text-[0.7rem]">
            Incoming line length (m, optional)
          </span>
          <input
            type="number"
            min="0"
            step="any"
            className="input input-bordered input-xs"
            value={lineLength}
            onChange={(e) => setLineLength(e.target.value)}
          />
        </label>

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
          <div className="rounded-box border border-base-300 p-2 text-xs space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">
                Annual chance of a direct strike
              </span>
              <span className="text-base font-bold">
                {formatPercent(result.annual_probability)}
              </span>
            </div>
            <div className="opacity-70">
              {formatReturnPeriod(result.return_period_years)}
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-sm">{result.hazard_band}</span>
              <span className="opacity-50">heuristic, not an IEC verdict</span>
            </div>
            <hr className="border-base-300" />
            <p className="opacity-70">
              Expected direct strikes/yr:{" "}
              {result.expected_direct_per_year.toExponential(2)}
            </p>
            <p className="opacity-70">
              Local ground flash density: {result.n_g.toFixed(3)} flashes/km²/yr
              ({result.ground_flash_count} ground of {result.total_flash_count}{" "}
              within {result.radius_km} km, over {result.span_years} yr)
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
  );
}
