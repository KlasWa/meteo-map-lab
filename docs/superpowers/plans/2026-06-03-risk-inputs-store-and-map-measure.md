# Strike-Risk Session Inputs + Map Rectangle-Measure Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Strike-risk form inputs in a session-only client store (no reload persistence), clear the computed result when the location changes, and add a map "measure" tool that draws a rectangle (grey live box) whose dimensions populate the Length/Width fields.

**Architecture:** A module-singleton store (`riskInputs.ts`) exposed via `useSyncExternalStore` holds the inputs; `RiskPanel` reads/writes it. `MapView` gains a generic rectangle-draw capability (two clicks + live grey GeoJSON box) and reports metres back via a callback; `App` wires the measured dimensions into the store. Pure geometry lives in `geo.ts`.

**Tech Stack:** React 19, TypeScript, Vite, MapTiler SDK (`@maptiler/sdk`, MapLibre underneath), Vitest (node env, `src/**/*.test.ts`, explicit `import { describe, expect, it } from "vitest"`).

**Design doc:** `docs/superpowers/specs/2026-06-03-risk-inputs-store-and-map-measure-design.md`

**Test commands:**
- Unit tests: `cd frontend && npm test`
- Typecheck: `cd frontend && npm run typecheck`
- Lint: `cd frontend && npm run lint`

---

## File Structure

- Create `frontend/src/lib/geo.ts` — pure `haversineMeters` + `rectangleDimensions`.
- Create `frontend/src/lib/geo.test.ts` — geometry tests.
- Create `frontend/src/lib/riskInputs.ts` — session store + `useRiskInputs` hook.
- Create `frontend/src/lib/riskInputs.test.ts` — store API tests.
- Modify `frontend/src/components/MapView.tsx` — generic rectangle-draw capability (optional props).
- Modify `frontend/src/components/RiskPanel.tsx` — use the store; clear result on location change; add the measure button + props.
- Modify `frontend/src/App.tsx` — `drawing` state; wire MapView + RiskPanel.

**Task ordering** keeps every commit type-checking green: MapView's new props are optional (so `App` compiles before they're passed); RiskPanel's store switch (Task 4) keeps its `{lat, lon}` props unchanged; the cross-component measure wiring (RiskPanel new props + App) lands together in Task 5.

---

## Task 1: Pure geometry helpers (`geo.ts`)

**Files:**
- Create: `frontend/src/lib/geo.ts`
- Test: `frontend/src/lib/geo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/geo.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { haversineMeters, rectangleDimensions } from "./geo";

describe("haversineMeters", () => {
  it("is ~111 km for one degree of latitude", () => {
    const d = haversineMeters(59, 18, 60, 18);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_600);
  });

  it("is zero for identical points", () => {
    expect(haversineMeters(59, 18, 59, 18)).toBeCloseTo(0, 5);
  });

  it("is symmetric", () => {
    const a = haversineMeters(59, 18, 59.001, 18.002);
    const b = haversineMeters(59.001, 18.002, 59, 18);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("rectangleDimensions", () => {
  it("returns length >= width", () => {
    const { lengthM, widthM } = rectangleDimensions(
      { lat: 59, lon: 18 },
      { lat: 59.0005, lon: 18.002 },
    );
    expect(lengthM).toBeGreaterThanOrEqual(widthM);
  });

  it("assigns the larger span to length and smaller to width", () => {
    const a = { lat: 59, lon: 18 };
    const b = { lat: 59.0005, lon: 18.002 };
    const { lengthM, widthM } = rectangleDimensions(a, b);
    const ew = haversineMeters(59.00025, 18, 59.00025, 18.002);
    const ns = haversineMeters(59, 18, 59.0005, 18);
    expect(lengthM).toBeCloseTo(Math.max(ew, ns), 3);
    expect(widthM).toBeCloseTo(Math.min(ew, ns), 3);
  });

  it("is ~zero for a degenerate point", () => {
    const { lengthM, widthM } = rectangleDimensions(
      { lat: 59, lon: 18 },
      { lat: 59, lon: 18 },
    );
    expect(lengthM).toBeCloseTo(0, 5);
    expect(widthM).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- geo`
Expected: FAIL — cannot resolve `./geo`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/geo.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- geo`
Expected: PASS (7 assertions across the two describes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/geo.ts frontend/src/lib/geo.test.ts
git commit -m "feat(frontend): pure haversine + rectangle dimension helpers"
```

---

## Task 2: Session store (`riskInputs.ts`)

**Files:**
- Create: `frontend/src/lib/riskInputs.ts`
- Test: `frontend/src/lib/riskInputs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/riskInputs.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  getRiskInputs,
  setFactor,
  setLength,
  subscribe,
} from "./riskInputs";

describe("riskInputs store", () => {
  it("has sensible defaults", () => {
    const s = getRiskInputs();
    expect(s.width).toBe("10");
    expect(s.height).toBe("5");
    expect(s.factor).toBe(1);
  });

  it("returns a stable reference until a setter runs, new ref after", () => {
    const before = getRiskInputs();
    expect(getRiskInputs()).toBe(before);
    setLength("7");
    expect(getRiskInputs()).not.toBe(before);
    expect(getRiskInputs().length).toBe("7");
  });

  it("notifies subscribers; unsubscribe stops notifications", () => {
    let count = 0;
    const unsub = subscribe(() => {
      count += 1;
    });
    setLength("1");
    expect(count).toBe(1);
    unsub();
    setLength("2");
    expect(count).toBe(1);
  });

  it("setFactor updates the factor", () => {
    setFactor(2);
    expect(getRiskInputs().factor).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- riskInputs`
Expected: FAIL — cannot resolve `./riskInputs`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/riskInputs.ts`:

```ts
import { useSyncExternalStore } from "react";

import type { LocationFactor } from "./api";

export interface RiskInputsState {
  length: string; // metres, kept as strings to mirror the <input> values
  width: string;
  height: string;
  lineLength: string;
  factor: LocationFactor;
}

// In-memory module state: re-initialised on reload (no localStorage), and shared
// across the session so the inputs survive location switches and remounts.
let state: RiskInputsState = {
  length: "20",
  width: "10",
  height: "5",
  lineLength: "",
  factor: 1,
};

const listeners = new Set<() => void>();

// useSyncExternalStore requires a snapshot that is stable between mutations, so
// we return the same `state` object until a setter replaces it.
export function getRiskInputs(): RiskInputsState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(patch: Partial<RiskInputsState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const setLength = (length: string) => set({ length });
export const setWidth = (width: string) => set({ width });
export const setHeight = (height: string) => set({ height });
export const setLineLength = (lineLength: string) => set({ lineLength });
export const setFactor = (factor: LocationFactor) => set({ factor });

export function useRiskInputs(): RiskInputsState {
  return useSyncExternalStore(subscribe, getRiskInputs, getRiskInputs);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- riskInputs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/riskInputs.ts frontend/src/lib/riskInputs.test.ts
git commit -m "feat(frontend): session-scoped risk-inputs store"
```

---

## Task 3: MapView generic rectangle-draw capability

**Files:**
- Modify: `frontend/src/components/MapView.tsx`

This adds optional props and the draw interaction. Optional props mean `App` still compiles before Task 5 wires them.

- [ ] **Step 1: Replace the file contents**

Replace the ENTIRE contents of `frontend/src/components/MapView.tsx` with:

```tsx
import { useEffect, useLayoutEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { GeocodingControl } from "@maptiler/geocoding-control/maptilersdk";
import type { PickEvent } from "@maptiler/geocoding-control/maptilersdk";

import { rectangleDimensions } from "../lib/geo";
import type { LatLon } from "../lib/url-state";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

// Match the zoom the MapTiler geocoding control flies to for an address pick
// so a click / URL restore feels equivalent to a search.
const SELECTED_ZOOM = 18;

const BOX_SOURCE = "measure-box";
const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function boxFeatureCollection(a: LatLon, b: LatLon) {
  const ring = [
    [a.lon, a.lat],
    [b.lon, a.lat],
    [b.lon, b.lat],
    [a.lon, b.lat],
    [a.lon, a.lat],
  ];
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [ring] },
        properties: {},
      },
    ],
  };
}

function setBoxData(map: maptilersdk.Map, corners: [LatLon, LatLon] | null): void {
  const src = map.getSource(BOX_SOURCE) as maptilersdk.GeoJSONSource | undefined;
  if (!src) return;
  src.setData(corners ? boxFeatureCollection(corners[0], corners[1]) : EMPTY_FC);
}

type Props = {
  onSelect?: (lat: number, lon: number) => void;
  onMapClick?: (lat: number, lon: number) => void;
  selected?: LatLon | null;
  drawing?: boolean;
  onRectangleDrawn?: (lengthM: number, widthM: number) => void;
  onDrawCancel?: () => void;
};

export function MapView({
  onSelect,
  onMapClick,
  selected,
  drawing = false,
  onRectangleDrawn,
  onDrawCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maptilersdk.Map | null>(null);
  const markerRef = useRef<maptilersdk.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const selectedRef = useRef(selected);
  const drawingRef = useRef(drawing);
  const onRectangleDrawnRef = useRef(onRectangleDrawn);
  const onDrawCancelRef = useRef(onDrawCancel);
  const firstCornerRef = useRef<LatLon | null>(null);
  // Capture the initial selection so we can center the map on URL-restored
  // coordinates without making the init effect depend on `selected`.
  const initialSelectedRef = useRef(selected);

  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
    onMapClickRef.current = onMapClick;
    selectedRef.current = selected;
    drawingRef.current = drawing;
    onRectangleDrawnRef.current = onRectangleDrawn;
    onDrawCancelRef.current = onDrawCancel;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !apiKey) return;

    maptilersdk.config.apiKey = apiKey;
    const initial = initialSelectedRef.current;
    const map = new maptilersdk.Map({
      container,
      style: "https://api.maptiler.com/maps/hybrid-v4/style.json",
      center: initial ? [initial.lon, initial.lat] : [15.0, 62.0],
      zoom: initial ? SELECTED_ZOOM : 4,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(BOX_SOURCE, { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "measure-box-fill",
        type: "fill",
        source: BOX_SOURCE,
        paint: { "fill-color": "#9ca3af", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "measure-box-line",
        type: "line",
        source: BOX_SOURCE,
        paint: { "line-color": "#6b7280", "line-width": 2 },
      });
    });

    const gc = new GeocodingControl({ apiKey });
    map.addControl(gc);

    // PickEvent.feature.center is [lng, lat] (Position).
    const pickSub = gc.on("pick", (event: PickEvent) => {
      const coords = event.feature?.center;
      if (coords) onSelectRef.current?.(coords[1], coords[0]);
    });

    map.on("click", (event) => {
      const { lng, lat } = event.lngLat;

      // Draw mode swallows clicks: first click sets a corner, second finalises.
      if (drawingRef.current) {
        if (!firstCornerRef.current) {
          firstCornerRef.current = { lat, lon: lng };
          return;
        }
        const { lengthM, widthM } = rectangleDimensions(firstCornerRef.current, {
          lat,
          lon: lng,
        });
        firstCornerRef.current = null;
        setBoxData(map, null);
        if (lengthM < 1 && widthM < 1) {
          onDrawCancelRef.current?.();
        } else {
          onRectangleDrawnRef.current?.(lengthM, widthM);
        }
        return;
      }

      // If something is already selected, a map click clears it (handled by the
      // parent); only fly in when the click is actually selecting a new spot.
      if (!selectedRef.current) {
        map.flyTo({ center: [lng, lat], zoom: SELECTED_ZOOM });
      }
      onMapClickRef.current?.(lat, lng);
    });

    map.on("mousemove", (event) => {
      if (!drawingRef.current || !firstCornerRef.current) return;
      const { lng, lat } = event.lngLat;
      setBoxData(map, [firstCornerRef.current, { lat, lon: lng }]);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawingRef.current) onDrawCancelRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      pickSub.unsubscribe();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle the crosshair cursor and reset any half-drawn box when draw mode
  // turns on or off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    firstCornerRef.current = null;
    setBoxData(map, null);
  }, [drawing]);

  // Keep a single marker in sync with the selected coordinate. Reuses the
  // marker across updates so clicks/picks don't flicker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selected) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [selected.lon, selected.lat];
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
    } else {
      markerRef.current = new maptilersdk.Marker({ color: "#f43f5e" })
        .setLngLat(lngLat)
        .addTo(map);
    }
  }, [selected]);

  if (!apiKey) {
    return (
      <div style={{ padding: 16, fontFamily: "sans-serif" }}>
        Set <code>VITE_MAPTILER_KEY</code> in <code>frontend/.env</code> to load
        the map.
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: PASS. If `maptilersdk.GeoJSONSource` is not a valid type, fall back to `import type { GeoJSONSource } from "maplibre-gl"` and use that in `setBoxData` — report the change if so.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MapView.tsx
git commit -m "feat(frontend): MapView rectangle-draw capability with live grey box"
```

---

## Task 4: RiskPanel uses the store + clears result on location change

**Files:**
- Modify: `frontend/src/components/RiskPanel.tsx`

This keeps RiskPanel's props as `{ lat, lon }` (unchanged) so `App` still compiles. It delivers the session-store behaviour and the result-clearing.

- [ ] **Step 1: Update the React import**

In `frontend/src/components/RiskPanel.tsx`, change line 1:

```tsx
import { useState } from "react";
```
to:
```tsx
import { useEffect, useState } from "react";
```

- [ ] **Step 2: Add the store import**

After the existing import block (after the `import { formatPercent, formatReturnPeriod } from "../lib/risk-format";` line), add:

```tsx
import {
  setFactor,
  setHeight,
  setLength,
  setLineLength,
  setWidth,
  useRiskInputs,
} from "../lib/riskInputs";
```

- [ ] **Step 3: Replace the input state with the store**

Replace these five lines:

```tsx
  const [length, setLength] = useState("20");
  const [width, setWidth] = useState("10");
  const [height, setHeight] = useState("5");
  const [lineLength, setLineLength] = useState("");
  const [factor, setFactor] = useState<LocationFactor>(1);
```

with:

```tsx
  const { length, width, height, lineLength, factor } = useRiskInputs();
```

(The JSX `onChange` handlers already call `setLength`, `setWidth`, `setHeight`,
`setLineLength`, and `setFactor` — these now resolve to the imported store setters,
which take the same arguments, so no JSX change is needed. The `LocationFactor` cast in
the `factor` select's `onChange` stays as-is.)

- [ ] **Step 4: Clear the result when the location changes**

Immediately after the remaining state declarations (after
`const [busy, setBusy] = useState(false);`), add:

```tsx
  // The computed result is specific to lat/lon; clear it on a location switch so
  // a stale number is never shown for a new spot. Inputs live in the store and
  // are intentionally kept.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [lat, lon]);
```

- [ ] **Step 5: Typecheck, lint, test**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: PASS. (`LocationFactor` is still imported via the existing
`import type { LightningRisk, LocationFactor } from "../lib/api";` line and used by the
select cast — leave that import in place.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RiskPanel.tsx
git commit -m "feat(frontend): RiskPanel reads session store; clears result on location change"
```

---

## Task 5: Wire the measure tool (RiskPanel button + App)

**Files:**
- Modify: `frontend/src/components/RiskPanel.tsx`
- Modify: `frontend/src/App.tsx`

RiskPanel gains the new props and App passes them — done together so typecheck stays green.

- [ ] **Step 1: Add measure props to RiskPanel**

In `frontend/src/components/RiskPanel.tsx`, change the component signature:

```tsx
export function RiskPanel({ lat, lon }: { lat: number; lon: number }) {
```
to:
```tsx
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
```

- [ ] **Step 2: Add the measure button**

In `frontend/src/components/RiskPanel.tsx`, find the closing `</div>` of the 3-column
dimensions grid (the `<div className="grid grid-cols-3 gap-2">` block that contains
Length/Width/Height). Immediately AFTER that grid's closing `</div>`, insert:

```tsx
        <button
          type="button"
          className={`btn btn-xs ${measuring ? "btn-warning" : "btn-outline"}`}
          onClick={onToggleMeasure}
        >
          {measuring
            ? "Measuring… click two corners (Esc to cancel)"
            : "📐 Measure on map"}
        </button>
```

- [ ] **Step 3: Add drawing state + store import in App**

In `frontend/src/App.tsx`, add an import after the other `./lib/...` imports (near the
`getCloudCover` import block / the `url-state` imports):

```tsx
import { setLength, setWidth } from "./lib/riskInputs";
```

Inside the `App` component, add a state declaration alongside the other `useState`
hooks (e.g. near where `selection`/`resolution` state is declared):

```tsx
  const [drawing, setDrawing] = useState(false);
```

- [ ] **Step 4: Pass draw props to MapView**

In `frontend/src/App.tsx`, find the `<MapView ... />` element. Add these three props to
it (keep the existing `onSelect`/`onMapClick`/`selected` props):

```tsx
            drawing={drawing}
            onRectangleDrawn={(lengthM, widthM) => {
              setLength(String(Math.round(lengthM * 10) / 10));
              setWidth(String(Math.round(widthM * 10) / 10));
              setDrawing(false);
            }}
            onDrawCancel={() => setDrawing(false)}
```

- [ ] **Step 5: Pass measure props to RiskPanel**

In `frontend/src/App.tsx`, change:

```tsx
            <RiskPanel lat={selection.lat} lon={selection.lon} />
```
to:
```tsx
            <RiskPanel
              lat={selection.lat}
              lon={selection.lon}
              measuring={drawing}
              onToggleMeasure={() => setDrawing((d) => !d)}
            />
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/RiskPanel.tsx frontend/src/App.tsx
git commit -m "feat(frontend): map measure tool populates risk Length/Width"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run all frontend gates**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: all pass (geo + riskInputs test files green, existing tests unaffected).

- [ ] **Step 2: Manual smoke (requires `VITE_MAPTILER_KEY`)**

```bash
make up   # or: cd frontend && npm run dev  (with the backend running)
```
Open http://localhost:5173 and verify:
1. Pick a location, expand "Strike risk (IEC 62305)". Change Length to e.g. `33`.
2. Click a different location on the map → the Length value `33` is retained; any
   previously computed result is cleared.
3. Click "📐 Measure on map" → cursor becomes a crosshair; click one corner, move the
   mouse → a grey box follows the cursor; click the diagonal corner → the box disappears
   and Length/Width fill with the measured metres (rounded to 0.1 m). The location is not
   re-selected by those two clicks.
4. Start measuring again and press `Esc` (or click the button again) → draw mode exits,
   no box remains, fields unchanged.
5. Reload the browser → inputs reset to defaults (20/10/5), confirming no persistence.

- [ ] **Step 3: Final commit (only if verification produced changes)**

```bash
git add -A && git commit -m "chore: verify risk-inputs store + map measure tool" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** session store (T2) + `useRiskInputs` in RiskPanel (T4); clear result on location change (T4); `geo.ts` pure helpers (T1); MapView draw capability with live grey box + Esc + degenerate-cancel + select suppression (T3); App wiring writing rounded metres into the store (T5); RiskPanel button (T5); testing (T1/T2 unit, T6 manual). All design units mapped.
- **Type consistency:** store setters `setLength/setWidth/setHeight/setLineLength/setFactor` and `useRiskInputs`/`getRiskInputs`/`subscribe`/`RiskInputsState` are defined in T2 and used identically in T4/T5; `rectangleDimensions(a: LatLon, b: LatLon)` defined T1, used T3; MapView props `drawing/onRectangleDrawn/onDrawCancel` defined T3, passed T5; RiskPanel props `measuring/onToggleMeasure` defined T5 step 1, passed T5 step 5.
- **Green-per-commit:** MapView props optional (T3) so App compiles pre-wiring; RiskPanel props unchanged in T4; cross-component wiring atomic in T5.
- **No automated test for the map interaction** — geometry is covered by `geo.test.ts`; the MapView glue is verified manually (T6). This is called out, not hidden (the project has no React component-test harness).
