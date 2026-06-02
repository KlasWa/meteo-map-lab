# Cloud Layer Parameters (31/33/35) + Combined Max-Octas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch/cache SMHI cloud layer params 31/33/35 like 29, expose each individually via the existing endpoint, add a `/api/cloud-cover/combined` endpoint returning the per-timestamp max octas across layers 29/31/33/35, and chart that combined value in the frontend.

**Architecture:** The cloud pipeline is already fully `param`-scoped (client, parser, repo, service, aggregate). Individual layers come "free" by registering them and widening the route enum. The combined value anchors on the nearest param-29 station, reads all four layers from that single station id (no FK between `Observation` and `Station`), merges by timestamp taking the max of present values, and aggregates. The frontend swaps its octas series from bare param 29 to the combined endpoint.

**Tech Stack:** Python 3 / FastAPI / SQLModel / SQLite / pytest (backend, run via `uv`); React 19 / TypeScript / Vite / chart.js / openapi-typescript (frontend).

**Design doc:** `docs/superpowers/specs/2026-06-02-cloud-layer-params-combined-max-design.md`

**Test commands:**
- Backend: `cd backend && uv run pytest <path> -v`
- Frontend: `cd frontend && npm run typecheck && npm run lint`
- Full suite (Docker): `make test`
- Regenerate API types: `make gen-api` (runs `export_openapi.py` then `npm run gen:types`)

---

## File Structure

**Backend:**
- Modify `backend/app/services/parameters.py` — register 31/33/35; shared layer indeterminate set.
- Modify `backend/app/core/config.py` — `cloud_cover_params`, new `cloud_cover_layer_params`.
- Create `backend/app/services/combine.py` — pure `merge_layers_max` helper.
- Modify `backend/app/services/cloud_cover.py` — archive-404 tolerance; `get_combined_low_cloud`.
- Modify `backend/app/schemas/cloud_cover.py` — `CombinedCloudCoverResponse`.
- Modify `backend/app/api/routes.py` — extend `CloudParam`; add combined route.
- Tests: `test_parameters.py`, `test_config.py`, `test_combine.py` (new), `test_cloud_cover_service.py`, `test_cloud_cover_endpoint.py`.

**Frontend:**
- Regenerate `backend/openapi.json` + `frontend/src/lib/api-schema.d.ts`.
- Modify `frontend/src/lib/api.ts` — widen `CloudParam`; add `getCombinedCloud`.
- Modify `frontend/src/App.tsx` — octas series uses combined endpoint; relabel + describe.
- Modify `frontend/src/components/CloudCoverChart.tsx` — octas axis title.

---

## Task 1: Register layer params 31/33/35

**Files:**
- Modify: `backend/app/services/parameters.py`
- Test: `backend/tests/test_parameters.py`

- [ ] **Step 1: Update the failing tests**

Replace the body of `backend/tests/test_parameters.py` with:

```python
from app.services.parameters import PARAMETERS, ParameterSpec


def test_registry_has_all_cloud_params():
    assert set(PARAMETERS) == {16, 29, 31, 33, 35}
    assert isinstance(PARAMETERS[16], ParameterSpec)


def test_param_16_is_percent_with_113_indeterminate():
    spec = PARAMETERS[16]
    assert spec.unit == "percent"
    assert 113.0 in spec.indeterminate


def test_layer_params_are_octas_with_9_through_15_indeterminate():
    for pid in (29, 31, 33, 35):
        spec = PARAMETERS[pid]
        assert spec.unit == "octas", pid
        assert spec.label
        # code 9 (obscured) and 10-15 (METAR-reserved, empty) all drop to None
        assert {9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0} <= spec.indeterminate
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_parameters.py -v`
Expected: FAIL — `KeyError: 31` (or assertion on the set / indeterminate).

- [ ] **Step 3: Update the registry**

Replace lines 18-21 of `backend/app/services/parameters.py` (the `PARAMETERS` dict) with:

```python
# Octa layers share an indeterminate set: code 9 = "sky obscured", and codes
# 10-15 are METAR-reserved (empty in this feed). Mapping all to None keeps them
# from corrupting the layer-max combination.
_LAYER_INDETERMINATE = frozenset({9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0})

PARAMETERS: dict[int, ParameterSpec] = {
    16: ParameterSpec(16, "Total cloud cover", "percent", frozenset({113.0})),
    29: ParameterSpec(29, "Low cloud amount", "octas", _LAYER_INDETERMINATE),
    31: ParameterSpec(31, "Cloud amount, 2nd layer", "octas", _LAYER_INDETERMINATE),
    33: ParameterSpec(33, "Cloud amount, 3rd layer", "octas", _LAYER_INDETERMINATE),
    35: ParameterSpec(35, "Cloud amount, 4th layer", "octas", _LAYER_INDETERMINATE),
}
```

Also update the module docstring's indeterminate note (lines 1-5) to:

```python
"""Registry of supported SMHI cloud parameters.

Each parameter is stored in its native unit (no cross-conversion). The
`indeterminate` codes map to None during parsing (param 16: 113 = "cannot
determine"; octa layers 29/31/33/35: 9 = "sky obscured", 10-15 = METAR-reserved
and empty in this feed)."""
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_parameters.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/parameters.py backend/tests/test_parameters.py
git commit -m "feat(backend): register SMHI cloud layer params 31/33/35"
```

---

## Task 2: Config + route enum for individual layer exposure

**Files:**
- Modify: `backend/app/core/config.py:10-11`
- Modify: `backend/app/api/routes.py:27-32`
- Test: `backend/tests/test_config.py`, `backend/tests/test_cloud_cover_endpoint.py`

- [ ] **Step 1: Update config + endpoint tests**

In `backend/tests/test_config.py`, change the `cloud_cover_params` assertion (line 6) and add a layer-params assertion right after it:

```python
    assert settings.cloud_cover_params == [16, 29, 31, 33, 35]
    assert settings.cloud_cover_layer_params == [29, 31, 33, 35]
```

In `backend/tests/test_cloud_cover_endpoint.py`, add a test for individual layer access (append at end of file):

```python
def test_cloud_cover_param31_octas():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get(
        "/api/cloud-cover",
        params={"lat": 59.05, "lon": 18.05, "resolution": "daily", "param": 31},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["param"] == 31
    assert body["unit"] == "octas"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_config.py tests/test_cloud_cover_endpoint.py::test_cloud_cover_param31_octas -v`
Expected: FAIL — `AttributeError: ... cloud_cover_layer_params` / 422 for param=31.

- [ ] **Step 3: Update config and the route enum**

In `backend/app/core/config.py`, replace line 11 (`cloud_cover_params`) with:

```python
    cloud_cover_params: list[int] = [16, 29, 31, 33, 35]  # supported parameters
    cloud_cover_layer_params: list[int] = [29, 31, 33, 35]  # octa layers, low->high,
    # combined (max) by the /api/cloud-cover/combined endpoint
```

In `backend/app/api/routes.py`, replace the `CloudParam` enum (lines 27-32) with:

```python
class CloudParam(IntEnum):
    """Supported SMHI cloud parameters, as an integer enum so the query value
    is validated (422 on anything else) and surfaces as an int enum in OpenAPI."""

    TOTAL = 16  # total cloud cover, percent
    LOW = 29  # low-cloud amount, lowest layer, octas
    LAYER_2 = 31  # cloud amount, 2nd layer, octas
    LAYER_3 = 33  # cloud amount, 3rd layer, octas
    LAYER_4 = 35  # cloud amount, 4th layer, octas
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_config.py tests/test_cloud_cover_endpoint.py -v`
Expected: PASS (all endpoint tests including the new param31 test).

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/app/api/routes.py backend/tests/test_config.py backend/tests/test_cloud_cover_endpoint.py
git commit -m "feat(backend): expose cloud layers 31/33/35 via cloud-cover endpoint"
```

---

## Task 3: `merge_layers_max` pure helper

**Files:**
- Create: `backend/app/services/combine.py`
- Test: `backend/tests/test_combine.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_combine.py`:

```python
from app.dto import ParsedObs
from app.services.combine import merge_layers_max


def test_max_picks_highest_layer_per_timestamp():
    layer1 = [ParsedObs(1000, 1.0, "G"), ParsedObs(2000, 4.0, "G")]
    layer2 = [ParsedObs(1000, 3.0, "G"), ParsedObs(2000, 2.0, "G")]
    layer3 = [ParsedObs(1000, 5.0, "G")]
    merged = merge_layers_max([layer1, layer2, layer3])
    assert [(o.ts_utc, o.value) for o in merged] == [(1000, 5.0), (2000, 4.0)]


def test_none_values_are_skipped():
    layer1 = [ParsedObs(1000, None, "G"), ParsedObs(2000, 2.0, "G")]
    layer2 = [ParsedObs(1000, 3.0, "G")]
    merged = merge_layers_max([layer1, layer2])
    assert [(o.ts_utc, o.value) for o in merged] == [(1000, 3.0), (2000, 2.0)]


def test_timestamp_with_all_none_is_omitted():
    layer1 = [ParsedObs(1000, None, "G")]
    layer2 = [ParsedObs(1000, None, "G")]
    assert merge_layers_max([layer1, layer2]) == []


def test_empty_input_returns_empty():
    assert merge_layers_max([]) == []
    assert merge_layers_max([[], []]) == []


def test_result_is_sorted_by_timestamp():
    layer1 = [ParsedObs(3000, 1.0, "G"), ParsedObs(1000, 1.0, "G")]
    merged = merge_layers_max([layer1])
    assert [o.ts_utc for o in merged] == [1000, 3000]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_combine.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.combine'`.

- [ ] **Step 3: Write the implementation**

Create `backend/app/services/combine.py`:

```python
"""Combine per-layer cloud-amount observations into a single max-octas series.

SMHI reports octa layers cumulatively (WMO summation principle), so the maximum
value across layers 29/31/33/35 at a timestamp equals total low/mid cloud cover."""

from app.dto import ParsedObs


def merge_layers_max(series: list[list[ParsedObs]]) -> list[ParsedObs]:
    """Per-timestamp max over non-None layer values, sorted by timestamp.
    Timestamps where every layer is None or absent are omitted."""
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_combine.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/combine.py backend/tests/test_combine.py
git commit -m "feat(backend): add merge_layers_max helper for combined octas"
```

---

## Task 4: Archive-404 tolerance in `ensure_cached`

**Files:**
- Modify: `backend/app/services/cloud_cover.py:110-121`
- Test: `backend/tests/test_cloud_cover_service.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_cloud_cover_service.py`, add an `archive_404` flag to `FakeClient` and a test.

In `FakeClient.__init__` (after `self.recent_404 = False`, line 21), add:

```python
        self.archive_404 = False
```

In `FakeClient.fetch_archive` (line 39), make it honor the flag — replace the method with:

```python
    def fetch_archive(self, station_id, param=16):
        self.archive_calls += 1
        if self.archive_404:
            req = httpx.Request("GET", "http://smhi/corrected-archive")
            raise httpx.HTTPStatusError(
                "404", request=req, response=httpx.Response(404, request=req)
            )
        # one point inside 13 months, one ancient point that must be dropped
        return (
            "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n"
            "2025-01-01;00:00:00;80;G;;\n"
            "1990-01-01;00:00:00;10;G;;\n"
        )
```

Add this test at the end of the file:

```python
def test_archive_404_is_not_fatal(repo):
    # Layers 3/4 often lack a corrected-archive file (404). That must not fail
    # the request: record the attempt and serve the recent window instead.
    client = FakeClient()
    client.archive_404 = True
    svc = _service(repo, client)
    svc.ensure_cached(1, now_ms=NOW)  # must not raise
    assert client.recent_calls == 1
    assert client.archive_calls == 1
    # Recorded so we honor the archive TTL and don't re-hammer SMHI.
    assert repo.get_fetch_log(1, "archive") is not None
    # The recent observation is still cached and served.
    rows = repo.get_observations(1, 0, NOW)
    assert any(r.value == 40.0 for r in rows)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_cloud_cover_service.py::test_archive_404_is_not_fatal -v`
Expected: FAIL — raises `SMHIUnavailable` (archive 404 currently fatal).

- [ ] **Step 3: Make archive 404 tolerant**

In `backend/app/services/cloud_cover.py`, replace the archive block (lines 110-121) with:

```python
        archive_log = self.repo.get_fetch_log(station_id, ARCHIVE, param=param)
        if archive_log is None or now_ms - archive_log.fetched_at > self.archive_ttl_ms:
            try:
                text = self.client.fetch_archive(station_id, param=param)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise SMHIUnavailable(str(exc)) from exc
                # No corrected-archive file for this station/param (common for
                # higher cloud layers). Not an outage: record the attempt so we
                # honor the TTL, and keep whatever the recent window provided.
                self.repo.record_fetch(station_id, ARCHIVE, now_ms, None, None, param=param)
                return
            except httpx.HTTPError as exc:
                raise SMHIUnavailable(str(exc)) from exc
            cutoff = now_ms - self.history_ms
            obs = [o for o in parse_archive_csv(text, indeterminate) if o.ts_utc >= cutoff]
            self.repo.upsert_observations(station_id, obs, param=param)
            self.repo.record_fetch(
                station_id, ARCHIVE, now_ms, _min_ts(obs), _max_ts(obs), param=param
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_cloud_cover_service.py -v`
Expected: PASS (all existing service tests plus the new one).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cloud_cover.py backend/tests/test_cloud_cover_service.py
git commit -m "fix(backend): treat archive 404 as no-data, not an outage"
```

---

## Task 5: `CombinedCloudCoverResponse` schema

**Files:**
- Modify: `backend/app/schemas/cloud_cover.py`
- Test: `backend/tests/test_cloud_cover_service.py` (covered indirectly in Task 6)

- [ ] **Step 1: Add the response model**

In `backend/app/schemas/cloud_cover.py`, append after `CloudCoverResponse`:

```python
class CombinedCloudCoverResponse(BaseModel):
    station: StationInfo
    source_params: list[int]  # layers combined, e.g. [29, 31, 33, 35]
    resolution: str
    unit: str  # "octas"
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[CloudPoint]
```

- [ ] **Step 2: Verify it imports**

Run: `cd backend && uv run python -c "from app.schemas.cloud_cover import CombinedCloudCoverResponse; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/cloud_cover.py
git commit -m "feat(backend): add CombinedCloudCoverResponse schema"
```

---

## Task 6: `get_combined_low_cloud` service method

**Files:**
- Modify: `backend/app/services/cloud_cover.py`
- Test: `backend/tests/test_cloud_cover_service.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_cloud_cover_service.py`, extend `FakeClient` so layers return distinct values and specific layers can 404, then add combined tests.

In `FakeClient.__init__`, add (after `self.archive_404 = False`):

```python
        self.layer_recent_404: set[int] = set()  # params whose recent file 404s
```

Replace `FakeClient.fetch_recent` with a version that returns a per-param octa value and can 404 per layer:

```python
    def fetch_recent(self, station_id, param=16):
        self.recent_calls += 1
        if self.recent_404 or param in self.layer_recent_404:
            req = httpx.Request("GET", "http://smhi/latest-months")
            raise httpx.HTTPStatusError(
                "404", request=req, response=httpx.Response(404, request=req)
            )
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        # Distinct octa per layer so the max is identifiable; 40 for total(16).
        layer_value = {29: "3", 31: "5", 33: "2", 35: "1"}
        val = layer_value.get(param, "40")
        return {"value": [{"date": NOW - 3600_000, "value": val, "quality": "G"}]}
```

Make `fetch_archive` 404 for all layer params by default (layers usually have no
archive in tests) — replace the method with:

```python
    def fetch_archive(self, station_id, param=16):
        self.archive_calls += 1
        if self.archive_404 or param in (29, 31, 33, 35):
            req = httpx.Request("GET", "http://smhi/corrected-archive")
            raise httpx.HTTPStatusError(
                "404", request=req, response=httpx.Response(404, request=req)
            )
        return (
            "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n"
            "2025-01-01;00:00:00;80;G;;\n"
            "1990-01-01;00:00:00;10;G;;\n"
        )
```

> Note: `test_get_cloud_cover_param29_uses_octas_unit` expects a param-29 value of
> `5.0`. Update that test's assertion (was `p.value == 5.0`) to `p.value == 3.0`
> to match the new layer values, OR keep 29→"5"; this plan uses 29→"3", so change
> the existing assertion on line 185 to `assert any(p.value == 3.0 for p in resp.points)`.

Add the combined tests at the end of the file:

```python
def test_combined_takes_max_across_layers(repo):
    client = FakeClient()
    svc = _service(repo, client)
    resp = svc.get_combined_low_cloud(59.05, 18.05, "hourly", now_ms=NOW)
    assert resp.unit == "octas"
    assert resp.source_params == [29, 31, 33, 35]
    assert resp.station.id == 1
    assert resp.stale is False
    # layer values 3/5/2/1 -> max 5
    assert any(p.value == 5.0 for p in resp.points)


def test_combined_resilient_to_missing_layers(repo):
    # Station reports only layers 1 and 2; 3 and 4 have no recent file (404).
    client = FakeClient()
    client.layer_recent_404 = {33, 35}
    svc = _service(repo, client)
    resp = svc.get_combined_low_cloud(59.05, 18.05, "hourly", now_ms=NOW)
    # max of layers 1 (3) and 2 (5) = 5
    assert any(p.value == 5.0 for p in resp.points)
    assert resp.stale is False


def test_combined_no_station_raises(repo):
    client = FakeClient()
    svc = _service(repo, client)
    with pytest.raises(NoStationFound):
        svc.get_combined_low_cloud(0.0, 0.0, "daily", now_ms=NOW)


def test_combined_stale_when_layer_refresh_fails(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.get_combined_low_cloud(59.05, 18.05, "hourly", now_ms=NOW)  # warm cache
    client.fail_recent = True
    resp = svc.get_combined_low_cloud(
        59.05, 18.05, "hourly", now_ms=NOW + settings.recent_ttl_seconds * 1000 + 1
    )
    assert resp.stale is True
    assert len(resp.points) >= 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_cloud_cover_service.py -k combined -v`
Expected: FAIL — `AttributeError: 'CloudCoverService' object has no attribute 'get_combined_low_cloud'`.

- [ ] **Step 3: Implement the service method**

In `backend/app/services/cloud_cover.py`:

Add the import near the top (after the `aggregate` import, line 10):

```python
from app.services.combine import merge_layers_max
```

Add `CombinedCloudCoverResponse` to the schema import (line 9):

```python
from app.schemas.cloud_cover import (
    CloudCoverResponse,
    CombinedCloudCoverResponse,
    StationInfo,
)
```

Append this method to the `CloudCoverService` class (after `get_cloud_cover`):

```python
    def get_combined_low_cloud(
        self,
        lat: float,
        lon: float,
        resolution: str,
        now_ms: int | None = None,
    ) -> CombinedCloudCoverResponse:
        """Combined octas series = per-timestamp max across the layer params.
        Anchors on the nearest station reporting the lowest layer (densest),
        then reads the higher layers from that same station id."""
        now_ms = now_ms if now_ms is not None else self._now_ms()
        layers = self.settings.cloud_cover_layer_params
        anchor = layers[0]

        self.ensure_station_list(anchor, now_ms)
        station = self.repo.nearest_station(lat, lon, self.nearest_max_km, param=anchor)
        if station is None:
            raise NoStationFound(
                f"No SMHI station within {self.nearest_max_km} km of ({lat}, {lon})."
            )

        stale = False
        for param in layers:
            with self._lock_for(param, station.id):
                try:
                    self.ensure_cached(station.id, now_ms, param=param)
                except SMHIUnavailable:
                    stale = True

        start = now_ms - self.history_ms
        layer_obs = [
            self.repo.get_observations(station.id, start, now_ms, param=param)
            for param in layers
        ]
        merged = merge_layers_max(layer_obs)
        if not merged and stale:
            raise SMHIUnavailable(
                "SMHI is unavailable and no cached layer data exists for this station."
            )

        points = aggregate(merged, resolution)
        distance = haversine_km(lat, lon, station.lat, station.lon)
        return CombinedCloudCoverResponse(
            station=StationInfo(
                id=station.id,
                name=station.name,
                lat=station.lat,
                lon=station.lon,
                distance_km=round(distance, 2),
            ),
            source_params=list(layers),
            resolution=resolution,
            unit="octas",
            stale=stale,
            points=points,
        )
```

> This requires `self.settings` to exist. In `CloudCoverService.__init__`, the
> constructor currently stores derived values but not `settings` itself. Add
> `self.settings = settings` as the first line of `__init__` (right after the
> docstring/signature, before `self.client = client`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_cloud_cover_service.py -v`
Expected: PASS (all service tests, including the 4 combined tests and the adjusted param-29 assertion).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cloud_cover.py backend/tests/test_cloud_cover_service.py
git commit -m "feat(backend): combined low-cloud max-octas service method"
```

---

## Task 7: Combined endpoint route

**Files:**
- Modify: `backend/app/api/routes.py`
- Test: `backend/tests/test_cloud_cover_endpoint.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_cloud_cover_endpoint.py`, update `FakeClient` to mirror the
service test (layer values + layer archives 404). Replace `fetch_recent` and
`fetch_archive`:

```python
    def fetch_recent(self, station_id, param=16):
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        layer_value = {29: "3", 31: "5", 33: "2", 35: "1"}
        val = layer_value.get(param, "40")
        return {"value": [{"date": NOW - 3600_000, "value": val, "quality": "G"}]}

    def fetch_archive(self, station_id, param=16):
        if param in (29, 31, 33, 35):
            req = httpx.Request("GET", "http://smhi/corrected-archive")
            raise httpx.HTTPStatusError(
                "404", request=req, response=httpx.Response(404, request=req)
            )
        return "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n2025-01-01;00:00:00;80;G;;\n"
```

Add these tests at the end:

```python
def test_combined_endpoint_ok():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get(
        "/api/cloud-cover/combined",
        params={"lat": 59.05, "lon": 18.05, "resolution": "hourly"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["unit"] == "octas"
    assert body["source_params"] == [29, 31, 33, 35]
    assert body["station"]["id"] == 1
    assert any(p["value"] == 5.0 for p in body["points"])  # max of 3/5/2/1


def test_combined_endpoint_no_station_is_404():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover/combined", params={"lat": 0.0, "lon": 0.0})
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_cloud_cover_endpoint.py -k combined -v`
Expected: FAIL — 404 from the router (route not registered) / wrong shape.

- [ ] **Step 3: Add the route**

In `backend/app/api/routes.py`, update the schema import (line 12):

```python
from app.schemas.cloud_cover import CloudCoverResponse, CombinedCloudCoverResponse
```

Add the route after the `cloud_cover` endpoint (after line 74):

```python
@router.get(
    "/api/cloud-cover/combined",
    response_model=CombinedCloudCoverResponse,
    tags=["cloud-cover"],
)
def cloud_cover_combined(
    lat: float,
    lon: float,
    resolution: Literal["hourly", "daily", "monthly"] = "daily",
    service: CloudCoverService = Depends(get_cloud_cover_service),
) -> CombinedCloudCoverResponse:
    try:
        return service.get_combined_low_cloud(lat, lon, resolution)
    except NoStationFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SMHIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
```

> Route ordering: FastAPI matches `/api/cloud-cover` and `/api/cloud-cover/combined`
> as distinct literal paths, so order does not matter here.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_cloud_cover_endpoint.py -v`
Expected: PASS (all endpoint tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes.py backend/tests/test_cloud_cover_endpoint.py
git commit -m "feat(backend): add /api/cloud-cover/combined endpoint"
```

---

## Task 8: Regenerate OpenAPI schema + frontend types

**Files:**
- Modify: `backend/openapi.json` (generated)
- Modify: `frontend/src/lib/api-schema.d.ts` (generated)

- [ ] **Step 1: Regenerate the schema and types**

If the Docker stack is running:

Run: `make gen-api`

Otherwise run the two steps directly:

```bash
cd backend && uv run python scripts/export_openapi.py
cd ../frontend && npm run gen:types
```

- [ ] **Step 2: Verify the new path is present**

Run: `grep -c "cloud-cover/combined" backend/openapi.json frontend/src/lib/api-schema.d.ts`
Expected: a non-zero count in both files.

- [ ] **Step 3: Commit**

```bash
git add backend/openapi.json frontend/src/lib/api-schema.d.ts
git commit -m "chore: regenerate OpenAPI schema + frontend types for combined endpoint"
```

---

## Task 9: Frontend API client — `getCombinedCloud`

**Files:**
- Modify: `frontend/src/lib/api.ts:20`, add new function

- [ ] **Step 1: Widen `CloudParam` and add the combined fetcher**

In `frontend/src/lib/api.ts`, replace line 20:

```typescript
export type CloudParam = 16 | 29 | 31 | 33 | 35;
```

After the `getCloudCover` function (after line 40), add:

```typescript
export type CombinedCloud =
  paths["/api/cloud-cover/combined"]["get"]["responses"]["200"]["content"]["application/json"];

export async function getCombinedCloud(
  lat: number,
  lon: number,
  resolution: Resolution,
): Promise<CombinedCloud> {
  const { data, error, response } = await client.GET("/api/cloud-cover/combined", {
    params: { query: { lat, lon, resolution } },
  });
  if (data) return data;
  if (response.status === 404) {
    throw new Error("No SMHI station near that location.");
  }
  if (response.status === 503) {
    throw new Error("SMHI is unavailable and no data is cached yet.");
  }
  throw new Error(error ? JSON.stringify(error) : "combined cloud request failed");
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no errors). The `CombinedCloud` type resolves from the regenerated schema.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add getCombinedCloud client + widen CloudParam"
```

---

## Task 10: Frontend chart — octas series uses combined endpoint

**Files:**
- Modify: `frontend/src/App.tsx` (PARAMS def ~65-85, loadCloud ~119-130, series ~274-289, description render ~410-412)
- Modify: `frontend/src/components/CloudCoverChart.tsx:99` (octas axis title)

- [ ] **Step 1: Update imports and the PARAMS entry**

In `frontend/src/App.tsx`, update the api import (line 7) to include the combined fetcher:

```typescript
import { getCloudCover, getCombinedCloud, getHealth, getLightning, purgeCache } from "./lib/api";
```

And the type import (line 8) to include `CombinedCloud`:

```typescript
import type { CloudCover, CloudParam, CombinedCloud, Lightning, Resolution } from "./lib/api";
```

Update the low-cloud `PARAMS` entry (lines 79-84) — keep `id: 29` as the result key
and octas axis, but relabel/redescribe to reflect the combined max:

```typescript
  {
    id: 29,
    label: "Cloud amount — layer max (octas)",
    description:
      "Max octas across SMHI cloud layers 29/31/33/35 (lowest to highest). SMHI reports layers cumulatively, so the max equals total low/mid cloud cover. Octas 0–8; codes 9–15 (obscured / not observed) are dropped.",
    color: "oklch(57% 0.21 27)",
    axis: "yOctas",
  },
```

Also update the comment on lines 65-66 to:

```typescript
// The two SMHI series shown together. Param 16 (percent, total cover) and the
// combined low/mid layer-max (octas) have different units, so each maps to its
// own Y-axis in the chart.
```

- [ ] **Step 2: Route the octas slot through the combined endpoint**

In `frontend/src/App.tsx`, find `loadCloud` (lines 124-138). Swap only the single
fetch line so id 29 uses the combined endpoint — keep the existing `catch (e: unknown)`
structure intact. Change line 128:

```typescript
          const data = await getCloudCover(sel.lat, sel.lon, res, p.id);
```

to:

```typescript
          const data =
            p.id === 29
              ? await getCombinedCloud(sel.lat, sel.lon, res)
              : await getCloudCover(sel.lat, sel.lon, res, p.id);
```

Leave the surrounding `try` / `catch (e: unknown)` / `Object.fromEntries` lines
unchanged.

- [ ] **Step 3: Widen `ParamResult` to accept the combined shape**

In `frontend/src/App.tsx`, update the `ParamResult` type (line 87):

```typescript
type ParamResult = { data: CloudCover | CombinedCloud | null; error: string | null };
```

The series builder (lines 274-289) reads only `res.data.points`, `res.data.station`,
`res.data.unit` — all present on both `CloudCover` and `CombinedCloud`, so no further
change is needed there. The legend row (lines 363-408) reads `res.data.station.*` and
`res.data.stale`/`res.data.attribution` via the `anyStale`/`attribution` helpers
(lines 291-296) — also present on both. Confirm `attribution` access compiles; both
types include it.

- [ ] **Step 4: Update the octas axis title**

In `frontend/src/components/CloudCoverChart.tsx`, replace line 99:

```typescript
          title: { display: true, text: "Cloud amount, layer max (octas)" },
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: PASS. If `tsc` complains that `CloudCover | CombinedCloud` lacks a shared
property at a usage site, narrow by reading only the shared fields
(`station`, `points`, `unit`, `stale`, `attribution`) — do not access `.param` or
`.source_params` in shared code paths.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/CloudCoverChart.tsx
git commit -m "feat(frontend): chart combined layer-max octas series"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all tests pass.

- [ ] **Step 2: Run the frontend checks**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 3: Manual smoke (Docker)**

```bash
make up
curl -s "http://localhost:8000/api/cloud-cover?lat=59.33&lon=18.06&resolution=daily&param=31" | head -c 300
curl -s "http://localhost:8000/api/cloud-cover/combined?lat=59.33&lon=18.06&resolution=daily" | head -c 300
```
Expected: param=31 returns `"unit":"octas"`; combined returns `"unit":"octas"` and
`"source_params":[29,31,33,35]`. Open http://localhost:5173 and confirm the octas
series renders under the new "Cloud amount — layer max (octas)" label with its
description line.

- [ ] **Step 4: Final commit (if any working-tree changes remain)**

```bash
git add -A && git commit -m "test: verify cloud layer params + combined endpoint" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** layers registered (T1); individual exposure via enum+config (T2); combined helper (T3); archive-404 tolerance (T4); response model (T5); service method with station anchoring + resilience + stale (T6); endpoint (T7); type regen (T8); frontend client (T9); frontend chart swap + relabel (T10); verification (T11). All design sections mapped.
- **Type consistency:** `merge_layers_max(series: list[list[ParsedObs]])` used identically in T3/T6; `CombinedCloudCoverResponse` fields (`station`, `source_params`, `resolution`, `unit`, `stale`, `attribution`, `points`) consistent across T5/T6/T7; `getCombinedCloud(lat, lon, resolution)` consistent T9/T10; `self.settings` added in T6 and read there only.
- **Known existing-test edit:** T6 changes the param-29 value in `FakeClient` (29→"3"), so the pre-existing `test_get_cloud_cover_param29_uses_octas_unit` assertion is updated in the same task to `p.value == 3.0`.
