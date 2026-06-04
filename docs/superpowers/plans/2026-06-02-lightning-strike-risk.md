# Lightning Strike Risk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an IEC 62305-style "chance of being hit by lightning" estimate for a point, derived from the SMHI strikes the app already caches plus user-supplied structure dimensions.

**Architecture:** A pure, I/O-free math module holds the IEC formulas (collection areas, ground flash density, Poisson probability). `LightningService` gains a `ground_flash_density()` method that reuses its existing fetch/bbox/haversine path (extracted into a shared helper). A new `GET /api/lightning-risk` endpoint orchestrates the two and returns a `RiskResponse`. The frontend adds a self-contained `RiskPanel` component.

**Tech Stack:** FastAPI + Pydantic + SQLModel (backend), pytest; React + TypeScript + Vite + daisyUI (frontend), vitest; types generated from OpenAPI via `make gen-api`.

**Spec:** `docs/superpowers/specs/2026-06-02-lightning-strike-risk-design.md`

**Test command convention:** backend single test —
`docker compose exec -T backend uv run pytest tests/<file>::<test> -v`
(the backend container's workdir is the backend package root, so test paths start with `tests/`). Full suite — `make test`.

---

### Task 1: Pure IEC math module

**Files:**
- Create: `backend/app/services/lightning_risk.py`
- Test: `backend/tests/test_lightning_risk.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_lightning_risk.py`:

```python
from math import isclose, pi

from app.services import lightning_risk as lr


def test_collection_area_structure_matches_iec_formula():
    # A_D = L*W + 6H(L+W) + 9*pi*H^2
    l, w, h = 20.0, 10.0, 5.0
    expected = l * w + 6 * h * (l + w) + 9 * pi * h * h
    assert isclose(lr.collection_area_structure(l, w, h), expected)


def test_collection_area_structure_flat_is_footprint():
    # Zero height -> area is just the footprint.
    assert lr.collection_area_structure(20.0, 10.0, 0.0) == 200.0


def test_collection_area_line():
    assert lr.collection_area_line(1000.0) == 40_000.0


def test_ground_flash_density_basic():
    # 7854 ground flashes over a 50 km radius (area ~7853.98 km^2) in 1 year
    # -> ~1.0 flashes/km^2/yr.
    n_g = lr.ground_flash_density(7854, radius_km=50.0, span_years=1.0)
    assert isclose(n_g, 7854 / (pi * 2500) / 1.0)


def test_ground_flash_density_zero_count():
    assert lr.ground_flash_density(0, radius_km=50.0, span_years=1.0) == 0.0


def test_ground_flash_density_guards_zero_span():
    assert lr.ground_flash_density(100, radius_km=50.0, span_years=0.0) == 0.0


def test_expected_events_converts_m2_to_km2():
    # N = N_G * A(km^2) * factor; 1e6 m^2 = 1 km^2.
    assert isclose(lr.expected_events(2.0, 1_000_000.0, 1.0), 2.0)
    assert isclose(lr.expected_events(2.0, 1_000_000.0, 0.5), 1.0)


def test_annual_probability_is_poisson():
    assert lr.annual_probability(0.0) == 0.0
    assert isclose(lr.annual_probability(1.0), 1 - pow(2.718281828459045, -1.0), rel_tol=1e-9)


def test_return_period_years():
    assert lr.return_period_years(0.0) is None
    assert isclose(lr.return_period_years(0.01), 100.0)


def test_hazard_band_boundaries():
    assert lr.hazard_band(0.00005) == "Very low"
    assert lr.hazard_band(0.0005) == "Low"
    assert lr.hazard_band(0.005) == "Moderate"
    assert lr.hazard_band(0.05) == "High"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T backend uv run pytest tests/test_lightning_risk.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.lightning_risk'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/lightning_risk.py`:

```python
"""Pure IEC 62305 lightning-risk math. No I/O — only formulas, so it is
trivially unit-testable. Collection areas are in m^2; densities are in
flashes per km^2 per year."""

from math import exp, pi

_M2_PER_KM2 = 1_000_000.0

# IEC location factors C_D (see schema/route enum).
LOCATION_FACTORS = (0.25, 0.5, 1.0, 2.0)


def collection_area_structure(length_m: float, width_m: float, height_m: float) -> float:
    """IEC direct-strike collection area A_D = L*W + 6H(L+W) + 9*pi*H^2, in m^2."""
    l, w, h = length_m, width_m, height_m
    return l * w + 6 * h * (l + w) + 9 * pi * h * h


def collection_area_line(line_length_m: float) -> float:
    """IEC service-line incidence area A_L = 40 * L_c, in m^2."""
    return 40.0 * line_length_m


def ground_flash_density(ground_flash_count: int, radius_km: float, span_years: float) -> float:
    """Empirical N_G = flashes / (pi * R^2) / years, in flashes/km^2/yr."""
    area_km2 = pi * radius_km * radius_km
    if area_km2 <= 0 or span_years <= 0:
        return 0.0
    return ground_flash_count / area_km2 / span_years


def expected_events(n_g: float, area_m2: float, factor: float = 1.0) -> float:
    """Expected annual events N = N_G * A(km^2) * factor."""
    return n_g * (area_m2 / _M2_PER_KM2) * factor


def annual_probability(expected_per_year: float) -> float:
    """Poisson probability of at least one event in a year: 1 - exp(-N)."""
    return 1.0 - exp(-expected_per_year)


def return_period_years(expected_per_year: float) -> float | None:
    """Return period 1/N in years; None when N == 0."""
    if expected_per_year <= 0:
        return None
    return 1.0 / expected_per_year


def hazard_band(p_annual: float) -> str:
    """Presentational heuristic band (NOT an IEC R1 compliance verdict)."""
    if p_annual < 1e-4:
        return "Very low"
    if p_annual < 1e-3:
        return "Low"
    if p_annual < 1e-2:
        return "Moderate"
    return "High"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T backend uv run pytest tests/test_lightning_risk.py -v`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lightning_risk.py backend/tests/test_lightning_risk.py
git commit -m "feat(backend): pure IEC 62305 lightning-risk math module"
```

---

### Task 2: Response schema

**Files:**
- Create: `backend/app/schemas/lightning_risk.py`

No new test file — the schema is exercised by the endpoint tests in Task 4. This task is a single commit.

- [ ] **Step 1: Create the schema**

Create `backend/app/schemas/lightning_risk.py`:

```python
from pydantic import BaseModel


class RiskResponse(BaseModel):
    # Echoed inputs
    lat: float
    lon: float
    length_m: float
    width_m: float
    height_m: float
    location_factor: float
    line_length_m: float | None = None

    # Derived hazard
    n_g: float  # ground flash density, flashes/km^2/yr
    radius_km: float  # radius used to derive N_G
    span_years: float  # window N_G was annualized over
    ground_flash_count: int
    total_flash_count: int

    # Results
    collection_area_km2: float  # structure A_D
    expected_direct_per_year: float  # N_D
    annual_probability: float  # 1 - exp(-N_D)
    return_period_years: float | None = None  # 1/N_D, None when N_D == 0
    expected_line_per_year: float | None = None  # N_L, None when no line length
    hazard_band: str

    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
```

- [ ] **Step 2: Verify it imports**

Run: `docker compose exec -T backend uv run python -c "from app.schemas.lightning_risk import RiskResponse; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/lightning_risk.py
git commit -m "feat(backend): RiskResponse schema for lightning-risk endpoint"
```

---

### Task 3: Service — extract `_strikes_within`, add `ground_flash_density`

**Files:**
- Modify: `backend/app/services/lightning.py`
- Test: `backend/tests/test_lightning_service.py` (append tests)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_lightning_service.py` (the file already defines `_raw`, `FakeClient`, `_service`, and `NOW`; reuse them). Add `cloud_indicator` support to the `_raw` helper by editing it, then add the new tests.

First, edit `_raw` so a strike's cloud indicator is controllable. Replace the existing `_raw` function with:

```python
def _raw(ts_ms, lat, lon, cloud_indicator=0):
    from datetime import datetime, timezone

    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return {
        "year": dt.year,
        "month": dt.month,
        "day": dt.day,
        "hours": dt.hour,
        "minutes": dt.minute,
        "seconds": dt.second,
        "nanoseconds": 0,
        "lat": lat,
        "lon": lon,
        "peakCurrent": -5,
        "cloudIndicator": cloud_indicator,
    }
```

Then append these tests at the end of the file:

```python
def test_ground_flash_density_counts_ground_only(lrepo):
    from datetime import datetime, timezone

    client = FakeClient()
    # Two ground flashes and one cloud flash, all near the point and recent.
    g1 = _raw(NOW - 3600_000, 59.30, 18.07, cloud_indicator=0)
    g2 = _raw(NOW - 7200_000, 59.31, 18.08, cloud_indicator=0)
    c1 = _raw(NOW - 7200_000, 59.31, 18.06, cloud_indicator=1)
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [g1, g2, c1]

    svc = _service(lrepo, client)
    d = svc.ground_flash_density(59.30, 18.07, now_ms=NOW)

    assert d.total_flash_count == 3
    assert d.ground_flash_count == 2
    assert d.radius_km == settings.lightning_radius_km
    assert d.span_years == settings.lightning_history_months / 12
    # N_G uses ground count only.
    from math import isclose, pi

    expected = 2 / (pi * d.radius_km * d.radius_km) / d.span_years
    assert isclose(d.n_g, expected)
    assert d.stale is False


def test_ground_flash_density_excludes_far_strikes(lrepo):
    from datetime import datetime, timezone

    client = FakeClient()
    near = _raw(NOW - 3600_000, 59.30, 18.07, cloud_indicator=0)
    far = _raw(NOW - 3600_000, 62.00, 18.07, cloud_indicator=0)  # ~300 km away
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [near, far]

    svc = _service(lrepo, client)
    d = svc.ground_flash_density(59.30, 18.07, now_ms=NOW)
    assert d.ground_flash_count == 1
    assert d.total_flash_count == 1


def test_ground_flash_density_cold_and_unavailable_raises(lrepo):
    client = FakeClient()
    client.fail = True
    svc = _service(lrepo, client)
    with pytest.raises(LightningUnavailable):
        svc.ground_flash_density(59.0, 18.0, now_ms=NOW)


def test_get_lightning_still_works_after_refactor(lrepo):
    from datetime import datetime, timezone

    client = FakeClient()
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [_raw(NOW - 3600_000, 59.30, 18.07)]
    svc = _service(lrepo, client)
    resp = svc.get_lightning(59.30, 18.07, "daily", now_ms=NOW)
    assert sum(p.count for p in resp.points) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T backend uv run pytest tests/test_lightning_service.py -v`
Expected: the new `ground_flash_density` tests FAIL with `AttributeError: 'LightningService' object has no attribute 'ground_flash_density'`. The existing tests and `test_get_lightning_still_works_after_refactor` still PASS.

- [ ] **Step 3: Refactor and implement**

Edit `backend/app/services/lightning.py`. Add a `DensityResult` dataclass, import the pure module, store `history_months`, extract `_strikes_within`, refactor `get_lightning` to use it, and add `ground_flash_density`.

At the top, add to the imports:

```python
from dataclasses import dataclass

from app.services import lightning_risk
```

After the existing module constants (after `_KM_PER_DEG_LAT = 111.0`), add:

```python
@dataclass(frozen=True)
class DensityResult:
    n_g: float  # flashes/km^2/yr
    ground_flash_count: int
    total_flash_count: int
    span_years: float
    radius_km: float
    stale: bool
```

In `__init__`, after `self.history_ms = settings.lightning_history_months * _MONTH_MS`, add:

```python
        self.history_months = settings.lightning_history_months
```

Add this helper method (e.g. just before `get_lightning`):

```python
    def _strikes_within(
        self, lat: float, lon: float, start_ms: int, now_ms: int
    ) -> tuple[list, bool]:
        """Ensure the window is cached, then return (strikes within radius_km of
        the point, stale). Shared by get_lightning and ground_flash_density."""
        day_starts = self._day_starts(start_ms, now_ms)
        with self._lock:
            stale = self.ensure_days(day_starts, now_ms)

        lat_delta = self.radius_km / _KM_PER_DEG_LAT
        lon_delta = self.radius_km / (_KM_PER_DEG_LAT * max(cos(radians(lat)), 0.01))
        candidates = self.repo.strikes_in_bbox(
            lat - lat_delta,
            lat + lat_delta,
            lon - lon_delta,
            lon + lon_delta,
            start_ms,
            now_ms,
        )
        within = [
            s for s in candidates if haversine_km(lat, lon, s.lat, s.lon) <= self.radius_km
        ]
        return within, stale
```

Replace the body of `get_lightning` (from `now_ms = ...` to the `return`) with:

```python
        now_ms = now_ms if now_ms is not None else self._now_ms()
        start_ms = now_ms - self.history_ms

        within, stale = self._strikes_within(lat, lon, start_ms, now_ms)
        if stale and not self.repo.has_any_day():
            raise LightningUnavailable("SMHI lightning is unavailable and nothing is cached.")

        return LightningResponse(
            center=LightningCenter(lat=lat, lon=lon),
            radius_km=self.radius_km,
            resolution=resolution,
            stale=stale,
            points=aggregate_counts(within, resolution),
        )
```

Add the new method after `get_lightning`:

```python
    def ground_flash_density(
        self, lat: float, lon: float, now_ms: int | None = None
    ) -> DensityResult:
        """Empirical ground flash density N_G from cached strikes around the
        point: ground flashes (cloud_indicator == 0) within radius_km, over the
        retained window, annualized. Raises LightningUnavailable when SMHI is
        down and nothing is cached (mirrors get_lightning)."""
        now_ms = now_ms if now_ms is not None else self._now_ms()
        start_ms = now_ms - self.history_ms

        within, stale = self._strikes_within(lat, lon, start_ms, now_ms)
        if stale and not self.repo.has_any_day():
            raise LightningUnavailable("SMHI lightning is unavailable and nothing is cached.")

        total = len(within)
        ground = sum(1 for s in within if s.cloud_indicator == 0)
        span_years = self.history_months / 12
        n_g = lightning_risk.ground_flash_density(ground, self.radius_km, span_years)
        return DensityResult(
            n_g=n_g,
            ground_flash_count=ground,
            total_flash_count=total,
            span_years=span_years,
            radius_km=self.radius_km,
            stale=stale,
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T backend uv run pytest tests/test_lightning_service.py -v`
Expected: PASS (all existing + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lightning.py backend/tests/test_lightning_service.py
git commit -m "feat(backend): LightningService.ground_flash_density via shared _strikes_within"
```

---

### Task 4: Endpoint `GET /api/lightning-risk`

**Files:**
- Modify: `backend/app/api/routes.py`
- Test: `backend/tests/test_lightning_risk_endpoint.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_lightning_risk_endpoint.py` (mirrors `test_lightning_endpoint.py`):

```python
from datetime import datetime, timezone

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401
from app.api.routes import get_lightning_service
from app.core.config import settings
from app.main import app
from app.repositories.lightning_sqlite import SqliteLightningRepository
from app.services.lightning import LightningService

NOW = 1_700_000_000_000


def _raw(ts_ms, lat, lon, cloud_indicator=0):
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return {
        "year": dt.year, "month": dt.month, "day": dt.day,
        "hours": dt.hour, "minutes": dt.minute, "seconds": dt.second,
        "nanoseconds": 0, "lat": lat, "lon": lon,
        "peakCurrent": -5, "cloudIndicator": cloud_indicator,
    }


class FakeClient:
    def __init__(self):
        self.fail = False
        self.days = {}

    def fetch_day(self, year, month, day):
        if self.fail:
            raise httpx.ConnectError("boom")
        return {"values": self.days.get((year, month, day), [])}


def _make_service(fake):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    svc = LightningService(fake, SqliteLightningRepository(engine), settings)
    svc._now_ms = lambda: NOW
    return svc


def _client_with(svc) -> TestClient:
    app.dependency_overrides[get_lightning_service] = lambda: svc
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


BASE = {"lat": 59.3, "lon": 18.1, "length_m": 20, "width_m": 10, "height_m": 5}


def test_risk_ok_with_strikes():
    fake = FakeClient()
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    fake.days[(dt.year, dt.month, dt.day)] = [
        _raw(NOW - 3600_000, 59.30, 18.10, cloud_indicator=0),
        _raw(NOW - 7200_000, 59.31, 18.11, cloud_indicator=1),  # cloud, excluded from N_G
    ]
    client = _client_with(_make_service(fake))
    r = client.get("/api/lightning-risk", params=BASE)
    assert r.status_code == 200
    body = r.json()
    assert body["ground_flash_count"] == 1
    assert body["total_flash_count"] == 2
    assert body["radius_km"] == settings.lightning_radius_km
    assert body["expected_direct_per_year"] > 0
    assert 0 < body["annual_probability"] < 1
    assert body["return_period_years"] is not None
    assert body["expected_line_per_year"] is None  # no line length given
    assert body["hazard_band"] in {"Very low", "Low", "Moderate", "High"}


def test_risk_zero_when_no_strikes():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params=BASE)
    assert r.status_code == 200
    body = r.json()
    assert body["n_g"] == 0.0
    assert body["expected_direct_per_year"] == 0.0
    assert body["annual_probability"] == 0.0
    assert body["return_period_years"] is None
    assert body["hazard_band"] == "Very low"


def test_risk_includes_line_when_length_given():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params={**BASE, "line_length_m": 1000})
    assert r.status_code == 200
    body = r.json()
    # N_G is 0 here, so the line figure is 0.0 (present, not None).
    assert body["expected_line_per_year"] == 0.0


def test_risk_422_on_nonpositive_dimension():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params={**BASE, "height_m": 0})
    assert r.status_code == 422


def test_risk_422_on_bad_location_factor():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params={**BASE, "location_factor": 0.7})
    assert r.status_code == 422


def test_risk_503_when_unavailable_and_cold():
    fake = FakeClient()
    fake.fail = True
    client = _client_with(_make_service(fake))
    r = client.get("/api/lightning-risk", params=BASE)
    assert r.status_code == 503
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec -T backend uv run pytest tests/test_lightning_risk_endpoint.py -v`
Expected: FAIL — the route does not exist yet (404, so the 200/422/503 assertions fail).

- [ ] **Step 3: Implement the endpoint**

Edit `backend/app/api/routes.py`.

Add to the imports at the top:

```python
from enum import Enum

from fastapi import Query
```

(Note: `IntEnum`, `APIRouter`, `Depends`, `HTTPException` are already imported. Add `Query` to the existing `from fastapi import ...` line and add the `Enum` import.)

Add these imports alongside the existing schema/service imports:

```python
from app.schemas.lightning_risk import RiskResponse
from app.services.lightning_risk import (
    annual_probability,
    collection_area_line,
    collection_area_structure,
    expected_events,
    hazard_band,
    return_period_years,
)
```

Add the location-factor enum near `CloudParam`:

```python
class LocationFactor(float, Enum):
    """IEC 62305 location factor C_D. As a float enum the query value is
    validated (422 on anything else) and surfaces as an enum in OpenAPI."""

    SURROUNDED_TALLER = 0.25  # surrounded by taller objects/trees
    SURROUNDED_EQUAL = 0.5  # surrounded by objects of equal/lower height
    ISOLATED = 1.0  # isolated, no nearby objects
    HILLTOP = 2.0  # isolated on a hilltop / promontory
```

Add the route (after the existing `lightning` route):

```python
@router.get(
    "/api/lightning-risk",
    response_model=RiskResponse,
    tags=["lightning"],
)
def lightning_risk(
    lat: float,
    lon: float,
    length_m: float = Query(gt=0),
    width_m: float = Query(gt=0),
    height_m: float = Query(gt=0),
    location_factor: LocationFactor = LocationFactor.ISOLATED,
    line_length_m: float | None = Query(default=None, gt=0),
    service: LightningService = Depends(get_lightning_service),
) -> RiskResponse:
    try:
        density = service.ground_flash_density(lat, lon)
    except LightningUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    area_d = collection_area_structure(length_m, width_m, height_m)
    n_d = expected_events(density.n_g, area_d, float(location_factor))
    line_per_year = (
        expected_events(density.n_g, collection_area_line(line_length_m))
        if line_length_m is not None
        else None
    )
    probability = annual_probability(n_d)

    return RiskResponse(
        lat=lat,
        lon=lon,
        length_m=length_m,
        width_m=width_m,
        height_m=height_m,
        location_factor=float(location_factor),
        line_length_m=line_length_m,
        n_g=density.n_g,
        radius_km=density.radius_km,
        span_years=density.span_years,
        ground_flash_count=density.ground_flash_count,
        total_flash_count=density.total_flash_count,
        collection_area_km2=area_d / 1_000_000.0,
        expected_direct_per_year=n_d,
        annual_probability=probability,
        return_period_years=return_period_years(n_d),
        expected_line_per_year=line_per_year,
        hazard_band=hazard_band(probability),
        stale=density.stale,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec -T backend uv run pytest tests/test_lightning_risk_endpoint.py -v`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Run the full backend suite**

Run: `docker compose exec -T backend uv run pytest`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes.py backend/tests/test_lightning_risk_endpoint.py
git commit -m "feat(backend): GET /api/lightning-risk endpoint"
```

---

### Task 5: Regenerate API types

**Files:**
- Modify: `backend/openapi.json`, `frontend/src/lib/api-schema.d.ts` (both generated)

- [ ] **Step 1: Regenerate**

Run (stack must be up — `make up` in another terminal):

```bash
make gen-api
```

Expected: `backend/openapi.json` and `frontend/src/lib/api-schema.d.ts` are updated to include the `/api/lightning-risk` path.

- [ ] **Step 2: Verify the new path is present**

Run: `grep -c "lightning-risk" frontend/src/lib/api-schema.d.ts`
Expected: a non-zero count (the path and its operation are present).

- [ ] **Step 3: Commit**

```bash
git add backend/openapi.json frontend/src/lib/api-schema.d.ts
git commit -m "chore: regenerate OpenAPI types for lightning-risk"
```

---

### Task 6: Frontend formatting helpers

**Files:**
- Create: `frontend/src/lib/risk-format.ts`
- Test: `frontend/src/lib/risk-format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/risk-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatPercent, formatReturnPeriod } from "./risk-format";

describe("formatPercent", () => {
  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0%");
  });
  it("formats a small probability with adaptive precision", () => {
    // 0.0012 -> 0.12%
    expect(formatPercent(0.0012)).toBe("0.12%");
  });
  it("formats a tiny probability without collapsing to 0%", () => {
    expect(formatPercent(0.0000005)).toBe("0.00005%");
  });
});

describe("formatReturnPeriod", () => {
  it("renders a dash for null", () => {
    expect(formatReturnPeriod(null)).toBe("—");
  });
  it("renders 1-in-N years rounded to 2 significant figures", () => {
    expect(formatReturnPeriod(1234)).toBe("≈ 1 in 1,200 years");
  });
  it("renders sub-year periods", () => {
    expect(formatReturnPeriod(0.5)).toBe("≈ 1 in 0.5 years");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec -T frontend sh -lc "npx vitest run src/lib/risk-format.test.ts"`
Expected: FAIL — cannot resolve `./risk-format`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/risk-format.ts`:

```ts
// Format an annual probability (0..1) as a percentage string with enough
// precision that small-but-nonzero values don't collapse to "0%".
export function formatPercent(p: number): string {
  if (p <= 0) return "0%";
  const pct = p * 100;
  // Show 2 significant figures of the percentage value.
  const digits = Math.max(0, 1 - Math.floor(Math.log10(pct)));
  return `${pct.toFixed(digits)}%`;
}

// Format a return period in years as "≈ 1 in N years"; null -> em dash.
export function formatReturnPeriod(years: number | null): string {
  if (years == null) return "—";
  const rounded = roundSig(years, 2);
  return `≈ 1 in ${rounded.toLocaleString("en-US")} years`;
}

function roundSig(value: number, sig: number): number {
  if (value === 0) return 0;
  const mag = Math.ceil(Math.log10(Math.abs(value)));
  const power = sig - mag;
  const factor = Math.pow(10, power);
  return Math.round(value * factor) / factor;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec -T frontend sh -lc "npx vitest run src/lib/risk-format.test.ts"`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/risk-format.ts frontend/src/lib/risk-format.test.ts
git commit -m "feat(frontend): risk-format helpers for probability and return period"
```

---

### Task 7: Frontend API helper

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the helper**

Append to `frontend/src/lib/api.ts`:

```ts
export type LightningRisk =
  paths["/api/lightning-risk"]["get"]["responses"]["200"]["content"]["application/json"];

export type LocationFactor = 0.25 | 0.5 | 1 | 2;

export interface RiskInput {
  lat: number;
  lon: number;
  length_m: number;
  width_m: number;
  height_m: number;
  location_factor: LocationFactor;
  line_length_m?: number;
}

export async function getLightningRisk(input: RiskInput): Promise<LightningRisk> {
  const { data, error, response } = await client.GET("/api/lightning-risk", {
    params: { query: input },
  });
  if (data) return data;
  if (response.status === 503) {
    throw new Error("SMHI lightning is unavailable and no data is cached yet.");
  }
  throw new Error(
    error ? JSON.stringify(error) : "lightning-risk request failed",
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `docker compose exec -T frontend sh -lc "npm run typecheck"`
Expected: PASS (no type errors). If the generated `query` type rejects the `RiskInput` shape, adjust by casting `query: input as never` is NOT allowed — instead ensure field names match the generated schema exactly (they should, per Task 5).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): getLightningRisk API helper"
```

---

### Task 8: Frontend RiskPanel component

**Files:**
- Create: `frontend/src/components/RiskPanel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/RiskPanel.tsx`:

```tsx
import { useState } from "react";

import { getLightningRisk } from "../lib/api";
import type { LightningRisk, LocationFactor } from "../lib/api";
import { formatPercent, formatReturnPeriod } from "../lib/risk-format";

const LOCATION_OPTIONS: { value: LocationFactor; label: string }[] = [
  { value: 0.25, label: "Surrounded by taller objects / trees" },
  { value: 0.5, label: "Surrounded by objects of equal/lower height" },
  { value: 1, label: "Isolated (no nearby objects)" },
  { value: 2, label: "Isolated on a hilltop / promontory" },
];

export function RiskPanel({ lat, lon }: { lat: number; lon: number }) {
  const [length, setLength] = useState("20");
  const [width, setWidth] = useState("10");
  const [height, setHeight] = useState("5");
  const [lineLength, setLineLength] = useState("");
  const [factor, setFactor] = useState<LocationFactor>(1);
  const [result, setResult] = useState<LightningRisk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const calculate = async () => {
    setBusy(true);
    setError(null);
    try {
      const lineNum = lineLength.trim() === "" ? undefined : Number(lineLength);
      const data = await getLightningRisk({
        lat,
        lon,
        length_m: Number(length),
        width_m: Number(width),
        height_m: Number(height),
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
            onChange={(e) => setFactor(Number(e.target.value) as LocationFactor)}
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
              <span className="font-semibold">Annual chance of a direct strike</span>
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
              Local ground flash density: {result.n_g.toFixed(3)} flashes/km²/yr (
              {result.ground_flash_count} ground of {result.total_flash_count} within{" "}
              {result.radius_km} km, over {result.span_years} yr)
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
```

- [ ] **Step 2: Typecheck**

Run: `docker compose exec -T frontend sh -lc "npm run typecheck"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RiskPanel.tsx
git commit -m "feat(frontend): RiskPanel component for lightning strike risk"
```

---

### Task 9: Wire RiskPanel into App

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Import the component**

Add to the imports near the other component imports in `frontend/src/App.tsx`:

```tsx
import { RiskPanel } from "./components/RiskPanel";
```

- [ ] **Step 2: Render it under the lightning section**

In `App.tsx`, find the closing `</div>` of the lightning block (immediately after the lightning chart's wrapper `<div className="relative mx-auto aspect-[3/1] ...">...</div>` and its parent `<div className="mt-2">`). Directly after that lightning block's closing `</div>` and before `{attribution && ...}`, insert:

```tsx
            <RiskPanel lat={selection.lat} lon={selection.lon} />
```

`selection` is non-null in this branch (it is the `else` of `!selection ?`), so `selection.lat` / `selection.lon` are safe here.

- [ ] **Step 3: Typecheck and lint**

Run: `docker compose exec -T frontend sh -lc "npm run typecheck && npm run lint"`
Expected: PASS.

- [ ] **Step 4: Manual smoke check**

With `make up` running, open http://localhost:5173, pick a location, expand "Strike risk (IEC 62305)", enter dimensions, and click Calculate. Expect a probability, a return period, a hazard badge, and the local N_G line.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): show RiskPanel under the lightning section"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `make test`
Expected: backend pytest passes; frontend typecheck, lint, and vitest pass.

- [ ] **Step 2: Update the README**

Add a short "How strike risk works" subsection to `README.md` after the cloud/lightning sections, summarizing: N_G derived from cached ground flashes within the radius, A_D from user dimensions, N_D = N_G·A_D·C_D, annual probability = 1−exp(−N_D), and that the hazard band is a heuristic (not an IEC R1 verdict). Reference the spec at `docs/superpowers/specs/2026-06-02-lightning-strike-risk-design.md`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document lightning strike risk feature"
```
```
