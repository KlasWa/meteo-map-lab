# Cloud Layer Parameters (31/33/35) + Combined Max-Octas — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)

## Problem

The app fetches and charts SMHI cloud parameters **16** (total cloud cover, %) and
**29** (low-cloud amount, lowest layer, octas). SMHI reports cloud amount in up to
four stacked layers from the ground up:

| Param | Layer | Unit |
|-------|-------|------|
| 29 | lowest (1st) | octas (code) |
| 31 | 2nd | octas (code) |
| 33 | 3rd | octas (code) |
| 35 | 4th | octas (code) |

Per the research note (`compass_artifact_wf-38e518bf-...md`), SMHI reports these layers
**cumulatively** (WMO SYNOP "summation principle"): each higher layer's octa value
includes everything below it and is monotonically non-decreasing, so the **maximum
octa value across the four layers equals total low/mid cloud cover in octas**.

We want to:
1. Fetch and cache layers 31, 33, 35 with the same machinery as 29.
2. Expose each layer **individually** through the API.
3. Expose a **combined** value = max octas across 29/31/33/35.
4. Surface the combined value in the frontend chart (replacing the bare param-29 series).

## Context: existing architecture

The cloud pipeline is already fully `param`-scoped end to end:

- `services/parameters.py` — `PARAMETERS` registry (`id`, `label`, `unit`, `indeterminate`).
- `services/smhi.py` — client fetches by `parameter/{param}/station/{id}/...` URLs.
- `services/smhi_parse.py` — **positional** CSV/JSON parsing (column-name agnostic), so
  layer params parse with no change.
- `repositories/sqlite.py` + `models.py` — `Station` and `Observation` are keyed by
  `(param, ...)`. **`Observation` has no foreign key to `Station`**, so observations
  for any param can be stored against any station id.
- `services/cloud_cover.py` — `ensure_station_list`, `ensure_cached`, `get_cloud_cover`,
  all take `param`. Per-`(param, station)` locks.
- `services/aggregate.py` — buckets `ParsedObs` into hourly/daily/monthly `CloudPoint`s.
- `api/routes.py` — `CloudParam(IntEnum)` validates the `param` query value;
  `GET /api/cloud-cover` and `DELETE /api/cache` (scope-based purge).
- Frontend: `lib/api.ts` (typed via `lib/api-schema.d.ts`, generated from
  `backend/openapi.json` by `npm run gen:types`), `App.tsx` (PARAMS → two series),
  `components/CloudCoverChart.tsx` (dual Y-axis: `yPercent` left, `yOctas` right).

## Design

### 1. Parameter registry — add 31/33/35

`services/parameters.py`:

```python
_LAYER_INDETERMINATE = frozenset({9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0})

PARAMETERS: dict[int, ParameterSpec] = {
    16: ParameterSpec(16, "Total cloud cover",        "percent", frozenset({113.0})),
    29: ParameterSpec(29, "Low cloud amount",         "octas",   _LAYER_INDETERMINATE),
    31: ParameterSpec(31, "Cloud amount, 2nd layer",  "octas",   _LAYER_INDETERMINATE),
    33: ParameterSpec(33, "Cloud amount, 3rd layer",  "octas",   _LAYER_INDETERMINATE),
    35: ParameterSpec(35, "Cloud amount, 4th layer",  "octas",   _LAYER_INDETERMINATE),
}
```

Code-cleaning decision: octa codes **9 (obscured)** and **10–15 (METAR-reserved, empty in
this feed)** all map to `None` so they never corrupt the max. This widens param 29's
indeterminate set from `{9}` to `{9..15}`; 10–15 are empty in practice, so the only
observable change is defensive correctness.

### 2. Individual layer exposure (no service changes)

- `api/routes.py`: extend `CloudParam(IntEnum)` with `LAYER_2 = 31`, `LAYER_3 = 33`,
  `LAYER_4 = 35` (keep `TOTAL = 16`, `LOW = 29`).
- `core/config.py`: `cloud_cover_params = [16, 29, 31, 33, 35]`.

`GET /api/cloud-cover?param=31|33|35` then works with the existing caching, TTLs,
archive-correction, station lookup, and aggregation — no new service code.

### 3. Combined endpoint

`GET /api/cloud-cover/combined?lat&lon&resolution` (resolution default `daily`).

**Station anchoring:** the max is only meaningful within a single station's vertical
column. Anchor on the **nearest station reporting param 29** (densest layer, ~213
stations); read layers 31/33/35 from that **same station id** (fetch is by station id,
so a layer the station does not report simply yields no data — no cross-station mixing).

**Config:** `cloud_cover_layer_params = [29, 31, 33, 35]` (the layers combined, in order).

**New pure helper** (`services/combine.py`):

```python
def merge_layers_max(series: list[list[ParsedObs]]) -> list[ParsedObs]:
    """Per-timestamp max over non-None layer values. Timestamps where every
    layer is None/absent are omitted. Result sorted by ts."""
    by_ts: dict[int, float] = {}
    for obs in series:
        for o in obs:
            if o.value is None:
                continue
            cur = by_ts.get(o.ts_utc)
            if cur is None or o.value > cur:
                by_ts[o.ts_utc] = o.value
    return [ParsedObs(ts, by_ts[ts], "G") for ts in sorted(by_ts)]
```

**Service method** `CloudCoverService.get_combined_low_cloud(lat, lon, resolution, now_ms=None)`:

1. `ensure_station_list(29, now_ms)`; `station = nearest_station(lat, lon, max_km, param=29)`;
   `None` → raise `NoStationFound`.
2. For each `p` in `cloud_cover_layer_params`: under `_lock_for(p, station.id)`, call
   `ensure_cached(station.id, now_ms, param=p)` in its own `try/except SMHIUnavailable`;
   set `stale = True` if any raises.
3. `layer_obs = [get_observations(station.id, now_ms - history_ms, now_ms, param=p) ...]`.
4. `merged = merge_layers_max(layer_obs)`. If `merged` empty and `stale` → raise
   `SMHIUnavailable`.
5. `points = aggregate(merged, resolution)`; return `CombinedCloudCoverResponse`.

**Resilience fix to `ensure_cached`:** today an **archive 404** is turned into
`SMHIUnavailable`. Layers 3/4 frequently have no corrected-archive file, so treat archive
404 the same as the existing recent-404 path: record the fetch attempt (honor TTL) and
serve whatever exists, instead of raising. This benefits the single-param path too and is
covered by a new test.

**Response model** (`schemas/cloud_cover.py`, reuses `StationInfo`/`CloudPoint`):

```python
class CombinedCloudCoverResponse(BaseModel):
    station: StationInfo
    source_params: list[int]   # [29, 31, 33, 35]
    resolution: str
    unit: str                  # "octas"
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[CloudPoint]
```

**Route:**

```python
@router.get("/api/cloud-cover/combined", response_model=CombinedCloudCoverResponse,
            tags=["cloud-cover"])
def cloud_cover_combined(lat, lon, resolution="daily", service=Depends(...)):
    try:
        return service.get_combined_low_cloud(lat, lon, resolution)
    except NoStationFound as exc: raise HTTPException(404, str(exc))
    except SMHIUnavailable as exc: raise HTTPException(503, str(exc))
```

Cache purge: combined writes observations under params 29/31/33/35, which the existing
`scope="cloud"` purge already clears — no purge change needed.

### 4. Frontend

1. Regenerate `backend/openapi.json`, then `npm run gen:types`.
2. `lib/api.ts`: widen `CloudParam` to `16 | 29 | 31 | 33 | 35`; add
   `getCombinedCloud(lat, lon, resolution)` hitting `/api/cloud-cover/combined`
   (same 404/503 error mapping as `getCloudCover`).
3. `App.tsx`: the second chart series (the `yOctas` slot, currently bare param 29)
   switches to the **combined** endpoint. The combined response carries
   `station / unit / stale / attribution / points`, exactly the fields the UI reads, so
   the chart, legend row, station marker, and stale badge work unchanged. The result type
   for that slot becomes `CloudCover | CombinedCloud` (structurally compatible on the
   consumed fields).
4. Update the series label to **"Cloud amount — layer max (octas)"** and rewrite its
   description line to explain the cumulative layer-max method (max octas across SMHI
   layers 29/31/33/35; equals total low/mid cloud cover because layers are cumulative;
   octas 0–8; codes 9–15 dropped).
5. `CloudCoverChart.tsx`: update the `yOctas` axis title text if needed (e.g. "Cloud
   amount, layer max (octas)").

### 5. Testing

- **`parameters`**: 31/33/35 present with `octas` + `_LAYER_INDETERMINATE`.
- **`merge_layers_max`** (unit): max picks highest layer; `None` skipped; all-`None`/absent
  ts omitted; empty input → empty.
- **`ensure_cached`**: archive 404 no longer raises — records attempt, serves recent.
- **`get_combined_low_cloud`**: happy path (max equals highest populated layer);
  missing-layer resilience (station reports only layers 1–2); stale when a layer refresh
  fails but cache exists; `NoStationFound` when no param-29 station in range.
- **API**: `GET /api/cloud-cover?param=31` returns octas; `GET /api/cloud-cover/combined`
  returns `unit="octas"` and `source_params=[29,31,33,35]`.
- Frontend `tsc --noEmit` / lint pass after the type regen and series swap.

## Trade-offs & alternatives considered

- **Dedicated endpoint vs. magic `param` value** for combined → dedicated endpoint
  (`/api/cloud-cover/combined`) chosen: keeps the `CloudParam` enum to real SMHI ids and
  the combined logic isolated.
- **Anchor on param 29 vs. nearest-per-layer** → anchor on one station: the cumulative
  max is only valid within a single column; per-layer nearest stations would mix
  unrelated sites.
- **Combined unit octas vs. convert to %** → keep octas: it is the layers' native unit and
  drops straight into the existing `yOctas` axis. (×12.5 → % is available later if needed
  to compare against param 16.)
- **Sum vs. max** → max: summing double-counts vertically-overlapping layers and can
  exceed 8 octas. Under SMHI's cumulative convention the max is correct.

## Out of scope

- Showing all four individual layers in the chart (only the combined series is charted;
  individual layers remain queryable via the API).
- Octas→percent conversion / cross-validation against param 16.
- Cloud-base parameters (28/30/32/34).
