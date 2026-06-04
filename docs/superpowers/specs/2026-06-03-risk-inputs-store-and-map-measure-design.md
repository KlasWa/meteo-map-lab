# Strike-Risk Session Inputs + Map Rectangle-Measure Tool — Design

**Date:** 2026-06-03
**Status:** Approved (pending implementation plan)

## Problem

The "Strike risk (IEC 62305)" panel (`frontend/src/components/RiskPanel.tsx`) holds its
form inputs (length, width, height, line length, surroundings factor) and the computed
result in local component `useState`. Two improvements are wanted:

1. **Keep the inputs across location switches** via session-scoped client global state —
   explicitly NOT persisted across a browser reload (no `localStorage`/`sessionStorage`).
2. **A map "measure" tool**: a button puts the map into draw mode; the user clicks one
   corner then the diagonal corner of a rectangle; a grey bounding box follows the cursor
   in real time between the two clicks; on the second click the rectangle's dimensions
   populate the Length and Width fields and the box disappears.

## Context (existing code)

- `frontend/src/components/RiskPanel.tsx` — renders the collapsible risk form; inputs are
  local `useState`; receives `lat`/`lon` props; calls `getLightningRisk(...)` on Calculate.
- `frontend/src/components/MapView.tsx` — MapTiler SDK (`@maptiler/sdk`, MapLibre under
  the hood). The `Map` is created once in an init `useEffect`; a `map.on("click")` handler
  (wired through refs) selects a coordinate and `flyTo`s when nothing is selected yet.
  Callbacks/selection are kept in refs and refreshed in a `useLayoutEffect`.
- `frontend/src/App.tsx` — orchestrates `MapView` and the sidebar; owns `selection`
  (`LatLon | null`); renders `<RiskPanel lat={selection.lat} lon={selection.lon} />`
  inside the `selection`-truthy branch. Has a local `bearingDeg` helper (no haversine).
- No frontend haversine util exists; no React component-test harness (vitest runs
  pure-module tests only — `risk-format.test.ts`, `lightning-fill.test.ts`).

## Design

### Unit 1 — `frontend/src/lib/riskInputs.ts` (session-global store)

A singleton in-memory store for the risk form inputs, exposed via a React hook. Plain
module state: re-initialized on reload (no persistence), survives remounts and location
switches.

Shape:

```ts
export interface RiskInputsState {
  length: string;   // metres (kept as strings to mirror the <input> values)
  width: string;
  height: string;
  lineLength: string;
  factor: LocationFactor;
}
```

Defaults match today's RiskPanel: `length "20"`, `width "10"`, `height "5"`,
`lineLength ""`, `factor 1`.

API:
- A module-private `state` object + a `Set<() => void>` of listeners.
- `getRiskInputs(): RiskInputsState` — snapshot (returns the same frozen object reference
  until a setter mutates it, so `useSyncExternalStore` doesn't loop).
- `setRiskInput<K>(key, value)` — replaces `state` with a new object, notifies listeners.
- Convenience setters used by the UI: `setLength`, `setWidth`, `setHeight`,
  `setLineLength`, `setFactor`.
- `subscribe(listener): () => void`.
- `useRiskInputs(): RiskInputsState` — `useSyncExternalStore(subscribe, getRiskInputs)`.

`getRiskInputs` MUST return a stable reference between mutations (store the current
snapshot in a module variable, replace it only in setters) to satisfy
`useSyncExternalStore`'s caching contract.

### Unit 2 — `frontend/src/lib/geo.ts` (pure geometry)

- `haversineMeters(lat1, lon1, lat2, lon2): number` — great-circle distance in metres.
- `rectangleDimensions(a: LatLon, b: LatLon): { lengthM: number; widthM: number }`:
  - The drawn box is axis-aligned in lng/lat. East–West extent = `haversineMeters` between
    `(midLat, a.lon)` and `(midLat, b.lon)`; North–South extent = `haversineMeters` between
    `(a.lat, a.lon)` and `(b.lat, a.lon)` (where `midLat = (a.lat + b.lat) / 2`).
  - `lengthM = max(ew, ns)`, `widthM = min(ew, ns)` (deterministic; orientation does not
    affect the IEC collection area).

Both pure and unit-tested. Reuse the existing `LatLon` type from `lib/url-state`.

### Unit 3 — `MapView.tsx` (generic rectangle-draw capability)

New optional props (MapView stays free of risk-domain concepts):

```ts
drawing?: boolean;
onRectangleDrawn?: (lengthM: number, widthM: number) => void;
onDrawCancel?: () => void;
```

Mechanics (all via refs, consistent with the existing handler-ref pattern):
- On map load (`map.on("load")`), add one GeoJSON source `"measure-box"` (empty
  `FeatureCollection`) and two layers: a fill (`#9ca3af`, `fill-opacity` ~0.25) and a line
  (`#6b7280`, width ~2). These render the grey box.
- Keep `drawing` in a `drawingRef` (refreshed in the existing `useLayoutEffect`) and a
  `firstCornerRef: LatLon | null`.
- When `drawing` turns true: set canvas cursor to `crosshair`, reset `firstCornerRef` to
  null, clear the box source.
- `map.on("click")` handler — at the top, if `drawingRef.current`:
  - if `firstCornerRef` is null → set it to the clicked `lngLat`; return (no select/flyTo).
  - else → second corner: compute `rectangleDimensions(firstCorner, clicked)`. If both
    dimensions are sub-metre (degenerate), call `onDrawCancel()`; otherwise call
    `onRectangleDrawn(lengthM, widthM)`. Either way clear the box + `firstCornerRef` and
    return (no select/flyTo). (The parent flips `drawing` to false.)
  - The existing non-drawing select/flyTo logic runs only when not drawing.
- `map.on("mousemove")` handler — if `drawingRef.current` and `firstCornerRef` set,
  `setData` a rectangle polygon (5 points) spanning `firstCorner`→cursor.
- `Esc` keydown (window listener active only while drawing) → `onDrawCancel()`.
- When `drawing` turns false: restore cursor (`""`), clear the box source and
  `firstCornerRef`.
- On unmount, remove listeners/source/layers as part of the existing cleanup.

### Unit 4 — `App.tsx` (wiring)

- Add `const [drawing, setDrawing] = useState(false)`.
- Pass to `MapView`:
  - `drawing={drawing}`
  - `onRectangleDrawn={(l, w) => { setLength(String(round1(l))); setWidth(String(round1(w))); setDrawing(false); }}` using the `riskInputs` setters (`round1` = round to 0.1 m).
  - `onDrawCancel={() => setDrawing(false)}`
- Pass to `RiskPanel`: `measuring={drawing}` and `onToggleMeasure={() => setDrawing(d => !d)}`.

### Unit 5 — `RiskPanel.tsx`

- Replace the five input `useState`s with `useRiskInputs()` + the store setters. `result`,
  `error`, `busy` remain local component state.
- Add `useEffect(() => { setResult(null); setError(null); }, [lat, lon])` so a location
  switch clears the now-stale result (inputs are untouched — they live in the store).
- Accept new props `measuring: boolean` and `onToggleMeasure: () => void`.
- Add a "📐 Measure on map" button near the Length/Width fields. While `measuring`, it
  shows "Measuring… click two corners (Esc to cancel)" and acts as a cancel toggle.

## Data flow

```
RiskPanel "Measure" button → onToggleMeasure → App setDrawing(true)
  → MapView drawing=true → click corner → mousemove (grey box) → click diagonal
  → onRectangleDrawn(lengthM,widthM) → App: riskInputs.setLength/Width + setDrawing(false)
  → store notifies → RiskPanel inputs (via useRiskInputs) show the measured dimensions
```

## Testing

- `geo.test.ts`: `haversineMeters` against known distances (e.g. ~111 km per degree of
  latitude; a short E–W span) within tolerance; `rectangleDimensions` returns
  `lengthM >= widthM`, correct E–W vs N–S assignment, and a degenerate (same-point) case.
- `riskInputs.test.ts`: defaults; a setter updates the snapshot and notifies a subscriber;
  `getRiskInputs` returns a stable reference until a setter runs; `subscribe` returns a
  working unsubscribe.
- Map draw interaction: verified manually (no component-test harness; the geometry is
  covered by `geo.test.ts`, and `MapView` keeps only thin glue logic).
- Regression: `npm run typecheck && npm run lint && npm test` all pass.

## Decisions

- **Store mechanism:** module singleton + `useSyncExternalStore` (chosen over Context or
  lifting into `App.tsx`): smallest well-bounded unit, no provider boilerplate, keeps the
  large `App.tsx` lean, independently testable, and session-only by construction.
- **MapView stays domain-agnostic:** it draws a rectangle and reports metres; `App` maps
  that onto the risk inputs.
- **length = longer side, width = shorter side** (orientation-independent).
- **Button in RiskPanel** (next to the fields it fills), not a floating map control.
- **Precision:** measured dimensions rounded to 0.1 m.

## Out of scope

- Touch / mobile drawing (desktop mouse-move driven; taps still set corners but no live
  hover box on touch).
- Persisting inputs across reloads (explicitly excluded).
- Non-rectangular shapes.
- Changing the height / line-length / surroundings via the map.

## Addendum (2026-06-03): rotated rectangle via 3 clicks

The 2-click axis-aligned rectangle is superseded by a **3-click rotated** rectangle so a
building's actual orientation can be captured:

- **Click 1** sets corner A. **Mousemove** previews a grey line A→cursor.
- **Click 2** sets corner B, locking one side (the baseline) in length and orientation.
  **Mousemove** now previews a grey rectangle with side AB pinned, sweeping perpendicular
  toward the cursor.
- **Click 3** finalizes: the perpendicular distance from the click to line AB is the other
  side. Dimensions populate Length/Width and the box clears.

**Geometry** (`geo.ts`): replace `rectangleDimensions` with a pure
`rotatedRectangle(a, b, c) → { corners: [LatLon, LatLon, LatLon, LatLon]; lengthM; widthM }`.
It projects the three points to local metres (equirectangular approximation around `a`'s
latitude — accurate at building scale), computes baseline vector `u = b − a`, perpendicular
unit `n̂`, signed width `w = (c − a) · n̂`, corners `a, b, b + n̂·w, a + n̂·w` (converted back
to lat/lon), and returns `lengthM = max(|u|, |w|)`, `widthM = min(|u|, |w|)` (longer→Length,
shorter→Width, unchanged convention). `haversineMeters` remains a tested utility.

**Interaction** (`MapView.tsx`): the draw state machine tracks two locked corners
(`cornerA`, `cornerB`); the GeoJSON source holds a LineString during phase 1 and the
rotated Polygon (`rotatedRectangle(...).corners`) during phase 2. `Esc` / toggling off /
`drawing=false` clears both corners. A degenerate final rectangle (both dims sub-metre)
cancels instead of populating.

**`App.tsx`** is unchanged (`onRectangleDrawn(lengthM, widthM)` still feeds the store).
**`RiskPanel`** button hint updates to reflect three clicks.
