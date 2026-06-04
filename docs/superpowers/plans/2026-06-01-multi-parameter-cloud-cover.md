# Multi-Parameter Cloud Cover (param 16 + 29) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve SMHI parameter 29 (low-cloud amount, octas 0–8) alongside parameter 16 (total cloud cover, percent 0–100), cached and aggregated identically, overlaid on one dual-axis chart.

**Architecture:** `param` becomes a first-class dimension threaded through client → service → repository → schema, backed by a small `PARAMETERS` registry (id → label/unit/indeterminate-codes). One service instance handles both params; the endpoint takes `?param=16|29`; the frontend fetches both and overlays on two Y-axes. Values stay native (no octa↔percent conversion).

**Tech Stack:** FastAPI, SQLModel/SQLite, httpx, pytest (backend); React 19, TypeScript, Chart.js, openapi-fetch (frontend).

**Staging strategy:** Every new `param` argument on client/repo/service methods is a **trailing keyword with default `16`**, and model `param` columns default to `16`. This keeps the historical param-16 behavior working — and the whole test suite green — at every commit, while the dimension is wired up layer by layer. The endpoint (Task 6) is what finally lets callers pass `29`.

**Before manual testing (not needed for the test suite — tests use in-memory SQLite):** the on-disk dev cache schema changes in Task 4. Recreate it with `make rebuild` (drops the volume and rebuilds) before running the stack manually.

---

### Task 1: Parameter registry + settings

**Files:**
- Create: `backend/app/services/parameters.py`
- Modify: `backend/app/core/config.py`
- Test: `backend/tests/test_parameters.py`, `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_parameters.py`:

```python
from app.services.parameters import PARAMETERS, ParameterSpec


def test_registry_has_16_and_29():
    assert set(PARAMETERS) == {16, 29}
    assert isinstance(PARAMETERS[16], ParameterSpec)


def test_param_16_is_percent_with_113_indeterminate():
    spec = PARAMETERS[16]
    assert spec.unit == "percent"
    assert 113.0 in spec.indeterminate


def test_param_29_is_octas_with_9_indeterminate():
    spec = PARAMETERS[29]
    assert spec.unit == "octas"
    assert 9.0 in spec.indeterminate
    assert spec.label
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_parameters.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.parameters'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/parameters.py`:

```python
"""Registry of supported SMHI cloud parameters.

Each parameter is stored in its native unit (no cross-conversion). The
`indeterminate` codes map to None during parsing (param 16: 113 = "cannot
determine"; param 29: 9 = "sky obscured")."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ParameterSpec:
    id: int
    label: str
    unit: str
    indeterminate: frozenset[float]


PARAMETERS: dict[int, ParameterSpec] = {
    16: ParameterSpec(16, "Total cloud cover", "percent", frozenset({113.0})),
    29: ParameterSpec(29, "Low cloud amount", "octas", frozenset({9.0})),
}
```

- [ ] **Step 4: Add the allowed-params setting**

In `backend/app/core/config.py`, add below the `cloud_cover_param` line:

```python
    cloud_cover_param: int = 16  # default parameter for the endpoint
    cloud_cover_params: list[int] = [16, 29]  # supported parameters
```

(Replace the existing `cloud_cover_param` comment line with these two lines.)

- [ ] **Step 5: Extend the config test**

In `backend/tests/test_config.py`, add inside `test_cloud_cover_defaults`:

```python
    assert settings.cloud_cover_param == 16
    assert settings.cloud_cover_params == [16, 29]
```

(Add the second line after the existing `cloud_cover_param` assertion.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_parameters.py tests/test_config.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/parameters.py backend/app/core/config.py backend/tests/test_parameters.py backend/tests/test_config.py
git commit -m "feat(backend): add cloud parameter registry (16 + 29)"
```

---

### Task 2: Parser takes per-parameter indeterminate codes

**Files:**
- Modify: `backend/app/services/smhi_parse.py`
- Test: `backend/tests/test_smhi_parse.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_smhi_parse.py`, add at the end:

```python
def test_parse_recent_json_octas_with_param29_indeterminate():
    # Param 29 reports octas 0-8; code 9 = "sky obscured" -> None.
    payload = {
        "value": [
            {"date": 1735689600000, "value": "8", "quality": "G"},
            {"date": 1735693200000, "value": "9", "quality": "G"},
            {"date": 1735696800000, "value": "0", "quality": "G"},
        ]
    }
    obs = parse_recent_json(payload, indeterminate=frozenset({9.0}))
    assert obs[0].cloud_pct == 8.0
    assert obs[1].cloud_pct is None  # 9 = obscured
    assert obs[2].cloud_pct == 0.0  # zero is real


def test_parse_archive_csv_respects_custom_indeterminate():
    text = (
        "Datum;Tid (UTC);Molnmängd;Kvalitet;;\n"
        "2025-01-01;00:00:00;9;G;;\n"
        "2025-01-01;01:00:00;3;G;;\n"
    )
    obs = parse_archive_csv(text, indeterminate=frozenset({9.0}))
    assert obs[0].cloud_pct is None
    assert obs[1].cloud_pct == 3.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_smhi_parse.py -v`
Expected: FAIL — `TypeError: parse_recent_json() got an unexpected keyword argument 'indeterminate'`

- [ ] **Step 3: Write minimal implementation**

Replace the body of `backend/app/services/smhi_parse.py` from the `_INDETERMINATE` line through `parse_recent_json` with:

```python
_DEFAULT_INDETERMINATE = frozenset({113.0})


def _to_ms(date_str: str, time_str: str) -> int:
    dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=timezone.utc
    )
    return int(dt.timestamp() * 1000)


def _parse_value(raw: str | None, indeterminate: frozenset[float]) -> float | None:
    if raw is None:
        return None
    raw = raw.strip()
    if raw == "":
        return None
    value = float(raw)
    return None if value in indeterminate else value


def parse_archive_csv(
    text: str, indeterminate: frozenset[float] = _DEFAULT_INDETERMINATE
) -> list[ParsedObs]:
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if line.startswith("Datum;"):
            start = i + 1
            break
    if start is None:
        return []

    out: list[ParsedObs] = []
    for line in lines[start:]:
        if not line.strip():
            continue
        cols = line.split(";")
        if len(cols) < 4:
            continue
        date_str, time_str, raw_val, quality = cols[0], cols[1], cols[2], cols[3]
        out.append(
            ParsedObs(
                ts_utc=_to_ms(date_str, time_str),
                cloud_pct=_parse_value(raw_val, indeterminate),
                quality=quality.strip(),
            )
        )
    return out


def parse_recent_json(
    payload: dict, indeterminate: frozenset[float] = _DEFAULT_INDETERMINATE
) -> list[ParsedObs]:
    out: list[ParsedObs] = []
    for item in payload.get("value") or []:
        out.append(
            ParsedObs(
                ts_utc=int(item["date"]),
                cloud_pct=_parse_value(item.get("value"), indeterminate),
                quality=item.get("quality", ""),
            )
        )
    return out
```

Note: `ParsedObs.cloud_pct` is still the field name here — it is renamed to `value` in Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_smhi_parse.py -v`
Expected: PASS (all parser tests, old and new)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/smhi_parse.py backend/tests/test_smhi_parse.py
git commit -m "feat(backend): parser accepts per-parameter indeterminate codes"
```

---

### Task 3: SMHIClient takes `param` per call

**Files:**
- Modify: `backend/app/services/smhi.py`
- Test: `backend/tests/test_smhi_client.py`

- [ ] **Step 1: Update the tests (red)**

Replace `backend/tests/test_smhi_client.py` entirely with:

```python
import json
from pathlib import Path

import httpx

from app.services.smhi import SMHIClient

FIXTURES = Path(__file__).parent / "fixtures"


def _client_with(handler) -> SMHIClient:
    transport = httpx.MockTransport(handler)
    return SMHIClient(base_url="https://example.test/api", transport=transport)


def test_fetch_station_list_maps_fields():
    body = (FIXTURES / "station_list_sample.json").read_text()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/version/1.0/parameter/16.json"
        return httpx.Response(200, content=body)

    stations = _client_with(handler).fetch_station_list()
    assert len(stations) == 2
    s = stations[0]
    assert s.id == 92410
    assert s.name == "Arvika A"
    assert s.lat == 59.6743
    assert s.lon == 12.6354
    assert s.active is True


def test_fetch_station_list_uses_param():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/version/1.0/parameter/29.json"
        return httpx.Response(200, content='{"station": []}')

    assert _client_with(handler).fetch_station_list(param=29) == []


def test_fetch_recent_returns_json():
    payload = json.loads((FIXTURES / "recent_sample.json").read_text())

    def handler(request: httpx.Request) -> httpx.Response:
        assert "latest-months/data.json" in request.url.path
        assert "/station/92410/" in request.url.path
        return httpx.Response(200, json=payload)

    data = _client_with(handler).fetch_recent(92410)
    assert data["value"][0]["value"] == "90"


def test_fetch_recent_uses_param():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "/parameter/29/" in request.url.path
        return httpx.Response(200, json={"value": []})

    _client_with(handler).fetch_recent(92410, param=29)


def test_fetch_archive_returns_text():
    csv_text = (FIXTURES / "archive_sample.csv").read_text()

    def handler(request: httpx.Request) -> httpx.Response:
        assert "corrected-archive/data.csv" in request.url.path
        return httpx.Response(200, text=csv_text)

    text = _client_with(handler).fetch_archive(92410)
    assert "Total molnmängd" in text


def test_http_error_propagates():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    try:
        _client_with(handler).fetch_recent(92410)
        raise AssertionError("expected HTTPStatusError")
    except httpx.HTTPStatusError:
        pass
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_smhi_client.py -v`
Expected: FAIL — `test_fetch_station_list_uses_param` / `test_fetch_recent_uses_param` error (param not accepted) and the constructor no longer takes `param`.

- [ ] **Step 3: Rewrite the client**

Replace `backend/app/services/smhi.py` entirely with:

```python
"""SMHI Open Data client for cloud parameters.

Synchronous httpx client wrapping the SMHI metobs endpoints. The parameter id
is passed per call (default 16) so one client serves every cloud parameter."""

import httpx

from app.dto import StationRaw

_API_VERSION = "1.0"
_DEFAULT_PARAM = 16


class SMHIClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self._client = httpx.Client(base_url=base_url, timeout=timeout, transport=transport)

    def fetch_station_list(self, param: int = _DEFAULT_PARAM) -> list[StationRaw]:
        r = self._client.get(f"/version/{_API_VERSION}/parameter/{param}.json")
        r.raise_for_status()
        data = r.json()
        out: list[StationRaw] = []
        for s in data.get("station", []):
            out.append(
                StationRaw(
                    id=int(s["id"]),
                    name=s.get("name", ""),
                    lat=float(s["latitude"]),
                    lon=float(s["longitude"]),
                    active=bool(s.get("active", False)),
                    from_ts=s.get("from"),
                    to_ts=s.get("to"),
                )
            )
        return out

    def fetch_recent(self, station_id: int, param: int = _DEFAULT_PARAM) -> dict:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{param}"
            f"/station/{station_id}/period/latest-months/data.json"
        )
        r.raise_for_status()
        return r.json()

    def fetch_archive(self, station_id: int, param: int = _DEFAULT_PARAM) -> str:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{param}"
            f"/station/{station_id}/period/corrected-archive/data.csv"
        )
        r.raise_for_status()
        return r.text
```

- [ ] **Step 4: Drop the now-removed constructor arg at the call site**

In `backend/app/api/routes.py`, change the client construction inside `get_cloud_cover_service` to:

```python
    client = SMHIClient(base_url=settings.smhi_base_url)
```

(Remove the `param=settings.cloud_cover_param` argument.)

- [ ] **Step 5: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS (client tests green; everything else unchanged — service still calls the client with default param 16).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/smhi.py backend/tests/test_smhi_client.py backend/app/api/routes.py
git commit -m "refactor(backend): SMHIClient takes param per call"
```

---

### Task 4: `param` dimension in models + repository (+ rename cloud_pct→value)

**Files:**
- Modify: `backend/app/dto.py`, `backend/app/models.py`, `backend/app/services/aggregate.py`, `backend/app/repositories/base.py`, `backend/app/repositories/sqlite.py`
- Test: `backend/tests/test_repository.py`, `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing repository test**

In `backend/tests/test_repository.py`, add at the end:

```python
def test_param_isolates_stations_and_observations(repo):
    # Same station id reporting two params, with different active status.
    repo.upsert_stations(
        [StationRaw(id=1, name="S16", lat=59.0, lon=18.0, active=True)], param=16
    )
    repo.upsert_stations(
        [StationRaw(id=1, name="S29", lat=59.0, lon=18.0, active=True)], param=29
    )
    repo.upsert_observations(1, [ParsedObs(1000, 50.0, "G")], param=16)
    repo.upsert_observations(1, [ParsedObs(1000, 7.0, "G")], param=29)

    assert repo.station_count(param=16) == 1
    assert repo.station_count(param=29) == 1
    obs16 = repo.get_observations(1, 0, 2000, param=16)
    obs29 = repo.get_observations(1, 0, 2000, param=29)
    assert obs16[0].value == 50.0
    assert obs29[0].value == 7.0


def test_nearest_station_isolates_by_param(repo):
    repo.upsert_stations(
        [StationRaw(id=1, name="Only16", lat=59.0, lon=18.0, active=True)], param=16
    )
    # No param-29 station -> nearest_station(param=29) finds nothing.
    assert repo.nearest_station(59.0, 18.0, max_km=150.0, param=29) is None
    assert repo.nearest_station(59.0, 18.0, max_km=150.0, param=16).id == 1
```

Also update the existing helper and assertions in this file to pass `param` and use `.value`:
- `_stations()` is unchanged.
- In every existing test that calls `repo.upsert_stations(_stations())`, leave it as-is (param defaults to 16).
- In `test_upsert_observations_dedupes_on_station_ts`, change `rows[0].cloud_pct` → `rows[0].value`.

- [ ] **Step 2: Update the models test (red)**

`Observation.cloud_pct` is renamed to `value`, and `Station` gains a composite PK `(param, id)` so `Session.get` needs the full key. Replace the body of `test_tables_create_and_roundtrip` in `backend/tests/test_models.py` with:

```python
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(Station(id=1, name="Test A", lat=59.0, lon=18.0, active=True))
        s.add(Observation(station_id=1, ts_utc=1000, value=50.0, quality="G"))
        s.commit()
        # Composite PK is (param, id); param defaults to 16.
        assert s.get(Station, (16, 1)).name == "Test A"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_repository.py -v`
Expected: FAIL — `upsert_stations() got an unexpected keyword argument 'param'` and `ParsedObs` has no attribute `value`.

- [ ] **Step 4: Rename the DTO field**

In `backend/app/dto.py`, change `ParsedObs`:

```python
@dataclass(frozen=True)
class ParsedObs:
    """One parsed cloud observation, storage-agnostic."""

    ts_utc: int  # epoch milliseconds, UTC
    value: float | None  # native unit (percent or octas), None = indeterminate
    quality: str  # SMHI quality code: G / Y / R
```

- [ ] **Step 5: Update the parser to use the new field name**

In `backend/app/services/smhi_parse.py`, change both `cloud_pct=_parse_value(...)` occurrences to `value=_parse_value(...)`. Then update `backend/tests/test_smhi_parse.py`: replace every `.cloud_pct` with `.value`.

- [ ] **Step 6: Update aggregate to use the new field name**

In `backend/app/services/aggregate.py`, in the `hourly` branch change `value=o.cloud_pct` → `value=o.value` and `0 if o.cloud_pct is None else 1` → `0 if o.value is None else 1`; in the bucket loop change `buckets.setdefault(key_fn(o.ts_utc), []).append(o.cloud_pct)` → `.append(o.value)`.

- [ ] **Step 7: Add `param` to the models**

Replace `backend/app/models.py` entirely with:

```python
"""SQLModel tables for the cloud cache. `param` is part of the identity so the
same station id can hold rows for multiple SMHI parameters."""

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Station(SQLModel, table=True):
    param: int = Field(default=16, primary_key=True)  # SMHI parameter id
    id: int = Field(primary_key=True)  # SMHI station id
    name: str
    lat: float
    lon: float
    active: bool = True
    from_ts: int | None = None
    to_ts: int | None = None


class Observation(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("param", "station_id", "ts_utc", name="uq_obs_param_station_ts"),
    )
    id: int | None = Field(default=None, primary_key=True)
    param: int = Field(default=16, index=True)
    station_id: int = Field(index=True)
    ts_utc: int = Field(index=True)  # epoch ms, UTC
    value: float | None = None  # native unit (percent/octas), None = indeterminate
    quality: str


class FetchLog(SQLModel, table=True):
    """Ledger of what has been fetched. station_id=0 with kind='station_list'
    records the per-parameter station-list refresh."""

    __table_args__ = (
        UniqueConstraint("param", "station_id", "kind", name="uq_fetchlog_param_station_kind"),
    )
    id: int | None = Field(default=None, primary_key=True)
    param: int = Field(default=16, index=True)
    station_id: int = Field(index=True)
    kind: str  # "archive" | "recent" | "station_list"
    fetched_at: int  # epoch ms
    covered_from: int | None = None
    covered_to: int | None = None
```

- [ ] **Step 8: Update the repository ABC**

Replace `backend/app/repositories/base.py` entirely with:

```python
"""Storage-agnostic cache interface. SqliteRepository is the default impl;
a Parquet/DuckDB impl could be swapped in without touching the service. Every
method is scoped by SMHI parameter id (`param`)."""

from abc import ABC, abstractmethod

from app.dto import ParsedObs, StationRaw
from app.models import FetchLog


class CacheRepository(ABC):
    @abstractmethod
    def upsert_stations(self, stations: list[StationRaw], param: int = 16) -> None: ...

    @abstractmethod
    def station_count(self, param: int = 16) -> int: ...

    @abstractmethod
    def nearest_station(
        self, lat: float, lon: float, max_km: float, param: int = 16
    ) -> StationRaw | None: ...

    @abstractmethod
    def upsert_observations(
        self, station_id: int, obs: list[ParsedObs], param: int = 16
    ) -> None: ...

    @abstractmethod
    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int, param: int = 16
    ) -> list[ParsedObs]: ...

    @abstractmethod
    def get_fetch_log(self, station_id: int, kind: str, param: int = 16) -> FetchLog | None: ...

    @abstractmethod
    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
        param: int = 16,
    ) -> None: ...
```

- [ ] **Step 9: Update the SQLite repository**

Replace `backend/app/repositories/sqlite.py` entirely with:

```python
"""SQLite-backed CacheRepository using SQLModel. All queries are scoped by
`param` so multiple SMHI parameters share the same tables without colliding."""

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.dto import ParsedObs, StationRaw
from app.models import FetchLog, Observation, Station
from app.repositories.base import CacheRepository
from app.services.geo import haversine_km


class SqliteRepository(CacheRepository):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_stations(self, stations: list[StationRaw], param: int = 16) -> None:
        if not stations:
            return
        rows = [
            {
                "param": param,
                "id": s.id,
                "name": s.name,
                "lat": s.lat,
                "lon": s.lon,
                "active": s.active,
                "from_ts": s.from_ts,
                "to_ts": s.to_ts,
            }
            for s in stations
        ]
        stmt = sqlite_insert(Station).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["param", "id"],
            set_={
                "name": stmt.excluded.name,
                "lat": stmt.excluded.lat,
                "lon": stmt.excluded.lon,
                "active": stmt.excluded.active,
                "from_ts": stmt.excluded.from_ts,
                "to_ts": stmt.excluded.to_ts,
            },
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def station_count(self, param: int = 16) -> int:
        with Session(self._engine) as s:
            return len(s.exec(select(Station.id).where(Station.param == param)).all())

    def nearest_station(
        self, lat: float, lon: float, max_km: float, param: int = 16
    ) -> StationRaw | None:
        # Only active stations have a latest-months data file on SMHI; closed
        # stations would 404 on fetch_recent, so they are not selectable.
        with Session(self._engine) as s:
            stations = s.exec(
                select(Station).where(Station.param == param, Station.active == True)  # noqa: E712
            ).all()
        best: Station | None = None
        best_d: float | None = None
        for st in stations:
            d = haversine_km(lat, lon, st.lat, st.lon)
            if best_d is None or d < best_d:
                best, best_d = st, d
        if best is None or best_d > max_km:
            return None
        return StationRaw(
            id=best.id,
            name=best.name,
            lat=best.lat,
            lon=best.lon,
            active=best.active,
            from_ts=best.from_ts,
            to_ts=best.to_ts,
        )

    def upsert_observations(
        self, station_id: int, obs: list[ParsedObs], param: int = 16
    ) -> None:
        if not obs:
            return
        rows = [
            {
                "param": param,
                "station_id": station_id,
                "ts_utc": o.ts_utc,
                "value": o.value,
                "quality": o.quality,
            }
            for o in obs
        ]
        stmt = sqlite_insert(Observation).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["param", "station_id", "ts_utc"],
            set_={
                "value": stmt.excluded.value,
                "quality": stmt.excluded.quality,
            },
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int, param: int = 16
    ) -> list[ParsedObs]:
        with Session(self._engine) as s:
            rows = s.exec(
                select(Observation)
                .where(
                    Observation.param == param,
                    Observation.station_id == station_id,
                    Observation.ts_utc >= start_ts,
                    Observation.ts_utc <= end_ts,
                )
                .order_by(Observation.ts_utc)
            ).all()
        return [ParsedObs(r.ts_utc, r.value, r.quality) for r in rows]

    def get_fetch_log(self, station_id: int, kind: str, param: int = 16) -> FetchLog | None:
        with Session(self._engine) as s:
            return s.exec(
                select(FetchLog).where(
                    FetchLog.param == param,
                    FetchLog.station_id == station_id,
                    FetchLog.kind == kind,
                )
            ).first()

    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
        param: int = 16,
    ) -> None:
        with Session(self._engine) as s:
            existing = s.exec(
                select(FetchLog).where(
                    FetchLog.param == param,
                    FetchLog.station_id == station_id,
                    FetchLog.kind == kind,
                )
            ).first()
            if existing:
                existing.fetched_at = fetched_at
                existing.covered_from = covered_from
                existing.covered_to = covered_to
                s.add(existing)
            else:
                s.add(
                    FetchLog(
                        param=param,
                        station_id=station_id,
                        kind=kind,
                        fetched_at=fetched_at,
                        covered_from=covered_from,
                        covered_to=covered_to,
                    )
                )
            s.commit()
```

- [ ] **Step 10: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS. The service still calls every repo method without `param` (defaults to 16), so service/endpoint tests are unaffected; new repo tests prove param isolation.

- [ ] **Step 11: Commit**

```bash
git add backend/app/dto.py backend/app/models.py backend/app/services/aggregate.py backend/app/services/smhi_parse.py backend/app/repositories/base.py backend/app/repositories/sqlite.py backend/tests/test_repository.py backend/tests/test_models.py backend/tests/test_smhi_parse.py
git commit -m "feat(backend): add param dimension to cache, rename cloud_pct->value"
```

---

### Task 5: Thread `param` through CloudCoverService

**Files:**
- Modify: `backend/app/services/cloud_cover.py`, `backend/app/schemas/cloud_cover.py`
- Test: `backend/tests/test_cloud_cover_service.py`

- [ ] **Step 1: Add `param` to the response schema**

In `backend/app/schemas/cloud_cover.py`, change `CloudCoverResponse`:

```python
class CloudCoverResponse(BaseModel):
    station: StationInfo
    param: int
    resolution: str
    unit: str
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[CloudPoint]
```

(`unit` loses its default — the service now always supplies it; `param` is new.)

- [ ] **Step 2: Update the service FakeClient and add a param-29 test (red)**

In `backend/tests/test_cloud_cover_service.py`, update `FakeClient` methods to accept `param` and add an octas branch, then add a test. Replace the three `fetch_*` methods with:

```python
    def fetch_station_list(self, param=16):
        self.station_calls += 1
        return [StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True)]

    def fetch_recent(self, station_id, param=16):
        self.recent_calls += 1
        if self.recent_404:
            req = httpx.Request("GET", "http://smhi/latest-months")
            raise httpx.HTTPStatusError(
                "404", request=req, response=httpx.Response(404, request=req)
            )
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        val = "5" if param == 29 else "40"
        return {"value": [{"date": NOW - 3600_000, "value": val, "quality": "G"}]}

    def fetch_archive(self, station_id, param=16):
        self.archive_calls += 1
        # one point inside 13 months, one ancient point that must be dropped
        return (
            "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n"
            "2025-01-01;00:00:00;80;G;;\n"
            "1990-01-01;00:00:00;10;G;;\n"
        )
```

Add this test at the end of the file:

```python
def test_get_cloud_cover_param29_uses_octas_unit(repo):
    client = FakeClient()
    svc = _service(repo, client)
    resp = svc.get_cloud_cover(59.05, 18.05, "hourly", param=29, now_ms=NOW)
    assert resp.param == 29
    assert resp.unit == "octas"
    assert resp.station.id == 1
    # The recent octas value (5) is served as-is, not converted.
    assert any(p.value == 5.0 for p in resp.points)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_cloud_cover_service.py::test_get_cloud_cover_param29_uses_octas_unit -v`
Expected: FAIL — `get_cloud_cover() got an unexpected keyword argument 'param'`.

- [ ] **Step 4: Thread param through the service**

Replace `backend/app/services/cloud_cover.py` entirely with:

```python
"""Orchestrates SMHI fetching, caching, and aggregation for cloud parameters."""

import time
from threading import Lock

import httpx

from app.repositories.base import CacheRepository
from app.schemas.cloud_cover import CloudCoverResponse, StationInfo
from app.services.aggregate import aggregate
from app.services.geo import haversine_km
from app.services.parameters import PARAMETERS
from app.services.smhi import SMHIClient
from app.services.smhi_parse import parse_archive_csv, parse_recent_json

ARCHIVE = "archive"
RECENT = "recent"
STATION_LIST = "station_list"
_STATION_LIST_ID = 0
_MONTH_MS = 30 * 24 * 3600 * 1000


class NoStationFound(Exception):
    """No station within the configured radius of the coordinate."""


class SMHIUnavailable(Exception):
    """SMHI could not be reached and no usable cached data exists."""


def _min_ts(obs):
    return min((o.ts_utc for o in obs), default=None)


def _max_ts(obs):
    return max((o.ts_utc for o in obs), default=None)


class CloudCoverService:
    def __init__(
        self,
        client: SMHIClient,
        repo: CacheRepository,
        settings,
    ) -> None:
        self.client = client
        self.repo = repo
        self.recent_ttl_ms = settings.recent_ttl_seconds * 1000
        self.station_list_ttl_ms = settings.station_list_ttl_days * 24 * 3600 * 1000
        self.history_ms = settings.history_months * _MONTH_MS
        self.nearest_max_km = settings.nearest_max_km
        self._locks: dict[tuple[int, int], Lock] = {}
        self._locks_guard = Lock()

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def _lock_for(self, param: int, station_id: int) -> Lock:
        key = (param, station_id)
        with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = Lock()
                self._locks[key] = lock
            return lock

    def ensure_station_list(self, param: int, now_ms: int) -> None:
        log = self.repo.get_fetch_log(_STATION_LIST_ID, STATION_LIST, param=param)
        fresh = log is not None and now_ms - log.fetched_at <= self.station_list_ttl_ms
        if fresh:
            return
        try:
            stations = self.client.fetch_station_list(param=param)
        except httpx.HTTPError as exc:
            if self.repo.station_count(param=param) == 0:
                raise SMHIUnavailable(str(exc)) from exc
            return  # keep using the existing (stale) list
        self.repo.upsert_stations(stations, param=param)
        self.repo.record_fetch(_STATION_LIST_ID, STATION_LIST, now_ms, None, None, param=param)

    def ensure_cached(self, param: int, station_id: int, now_ms: int) -> None:
        indeterminate = PARAMETERS[param].indeterminate

        # Recent window: refresh when missing or older than TTL.
        recent_log = self.repo.get_fetch_log(station_id, RECENT, param=param)
        if recent_log is None or now_ms - recent_log.fetched_at > self.recent_ttl_ms:
            try:
                payload = self.client.fetch_recent(station_id, param=param)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise SMHIUnavailable(str(exc)) from exc
                # No latest-months file for this station (it exists but has no
                # recent data). Not an outage: record the attempt so we honor
                # the TTL, then fall through to the archive.
                self.repo.record_fetch(station_id, RECENT, now_ms, None, None, param=param)
            except httpx.HTTPError as exc:
                raise SMHIUnavailable(str(exc)) from exc
            else:
                obs = parse_recent_json(payload, indeterminate)
                self.repo.upsert_observations(station_id, obs, param=param)
                self.repo.record_fetch(
                    station_id, RECENT, now_ms, _min_ts(obs), _max_ts(obs), param=param
                )

        # Archive: fetch once, then never again (immutable).
        archive_log = self.repo.get_fetch_log(station_id, ARCHIVE, param=param)
        if archive_log is None:
            try:
                text = self.client.fetch_archive(station_id, param=param)
            except httpx.HTTPError as exc:
                raise SMHIUnavailable(str(exc)) from exc
            cutoff = now_ms - self.history_ms
            obs = [o for o in parse_archive_csv(text, indeterminate) if o.ts_utc >= cutoff]
            self.repo.upsert_observations(station_id, obs, param=param)
            self.repo.record_fetch(
                station_id, ARCHIVE, now_ms, _min_ts(obs), _max_ts(obs), param=param
            )

    def get_cloud_cover(
        self,
        lat: float,
        lon: float,
        resolution: str,
        param: int = 16,
        now_ms: int | None = None,
    ) -> CloudCoverResponse:
        now_ms = now_ms if now_ms is not None else self._now_ms()
        self.ensure_station_list(param, now_ms)

        station = self.repo.nearest_station(lat, lon, self.nearest_max_km, param=param)
        if station is None:
            raise NoStationFound(
                f"No SMHI station within {self.nearest_max_km} km of ({lat}, {lon})."
            )

        stale = False
        with self._lock_for(param, station.id):
            try:
                self.ensure_cached(param, station.id, now_ms)
            except SMHIUnavailable:
                stale = True

        # Serve the same window we retain (history_months), so the endpoint
        # exposes everything the cache holds for the station.
        obs = self.repo.get_observations(
            station.id, now_ms - self.history_ms, now_ms, param=param
        )
        if not obs and stale:
            raise SMHIUnavailable("SMHI is unavailable and no cached data exists for this station.")

        points = aggregate(obs, resolution)
        distance = haversine_km(lat, lon, station.lat, station.lon)
        return CloudCoverResponse(
            station=StationInfo(
                id=station.id,
                name=station.name,
                lat=station.lat,
                lon=station.lon,
                distance_km=round(distance, 2),
            ),
            param=param,
            resolution=resolution,
            unit=PARAMETERS[param].unit,
            stale=stale,
            points=points,
        )
```

Note the call-order change: `get_cloud_cover(lat, lon, resolution, param=…, now_ms=…)` — `param` is inserted before `now_ms`. The endpoint test in `test_cloud_cover_endpoint.py` freezes `_now_ms` rather than passing `now_ms`, and the service tests pass `now_ms=` as a keyword, so both are unaffected.

- [ ] **Step 5: Update the endpoint test's FakeClient (keep the full suite green)**

In `backend/tests/test_cloud_cover_endpoint.py`, update `FakeClient` methods to accept `param`:

```python
    def fetch_station_list(self, param=16):
        return [StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True)]

    def fetch_recent(self, station_id, param=16):
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        return {"value": [{"date": NOW - 3600_000, "value": "40", "quality": "G"}]}

    def fetch_archive(self, station_id, param=16):
        return "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n2025-01-01;00:00:00;80;G;;\n"
```

- [ ] **Step 6: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS. (`unit` lost its schema default, but the service always supplies it; endpoint tests still assert `unit == "percent"` for the default param 16.)

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/cloud_cover.py backend/app/schemas/cloud_cover.py backend/tests/test_cloud_cover_service.py backend/tests/test_cloud_cover_endpoint.py
git commit -m "feat(backend): thread param through CloudCoverService, set unit per param"
```

---

### Task 6: Endpoint accepts `?param=16|29`

**Files:**
- Modify: `backend/app/api/routes.py`
- Test: `backend/tests/test_cloud_cover_endpoint.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_cloud_cover_endpoint.py`, add at the end:

```python
def test_cloud_cover_param29_octas():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get(
        "/api/cloud-cover",
        params={"lat": 59.05, "lon": 18.05, "resolution": "daily", "param": 29},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["param"] == 29
    assert body["unit"] == "octas"


def test_cloud_cover_default_param_is_16():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05})
    assert r.json()["param"] == 16
    assert r.json()["unit"] == "percent"


def test_cloud_cover_invalid_param_is_422():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.0, "lon": 18.0, "param": 99})
    assert r.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_cloud_cover_endpoint.py -v`
Expected: FAIL — `param` is ignored, so `body["param"]` is 16 for the param=29 request, and `param=99` returns 200 instead of 422.

- [ ] **Step 3: Add the param query argument**

In `backend/app/api/routes.py`, update the `cloud_cover` route. Change the imports line `from typing import Literal` is already present. Replace the `cloud_cover` function with:

```python
@router.get(
    "/api/cloud-cover",
    response_model=CloudCoverResponse,
    tags=["cloud-cover"],
)
def cloud_cover(
    lat: float,
    lon: float,
    resolution: Literal["hourly", "daily", "monthly"] = "daily",
    param: Literal[16, 29] = 16,
    service: CloudCoverService = Depends(get_cloud_cover_service),
) -> CloudCoverResponse:
    try:
        return service.get_cloud_cover(lat, lon, resolution, param=param)
    except NoStationFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SMHIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
```

- [ ] **Step 4: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS

- [ ] **Step 5: Lint**

Run: `cd backend && uv run ruff check app tests`
Expected: All checks passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes.py backend/tests/test_cloud_cover_endpoint.py
git commit -m "feat(backend): /api/cloud-cover accepts param=16|29"
```

---

### Task 7: Regenerate OpenAPI types + frontend API client

**Files:**
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/api-schema.d.ts` (generated)

- [ ] **Step 1: Regenerate the schema and types**

The stack must be running so the generators can reach the backend toolchain. From the repo root:

Run: `make gen-api`
Expected: `backend/...openapi.json` regenerated and `frontend/src/lib/api-schema.d.ts` updated to include `param` in the `/api/cloud-cover` query and `param`/`unit` in the response. (If the stack is not up, run `make up` in another terminal first.)

- [ ] **Step 2: Add `param` to the API helper**

In `frontend/src/lib/api.ts`, replace the `getCloudCover` function with:

```typescript
export type CloudParam = 16 | 29;

export async function getCloudCover(
  lat: number,
  lon: number,
  resolution: Resolution,
  param: CloudParam,
): Promise<CloudCover> {
  const { data, error, response } = await client.GET("/api/cloud-cover", {
    params: { query: { lat, lon, resolution, param } },
  });
  if (data) return data;
  // Surface the backend's status so the UI can show a useful message.
  if (response.status === 404) {
    throw new Error("No SMHI station near that location.");
  }
  if (response.status === 503) {
    throw new Error("SMHI is unavailable and no data is cached yet.");
  }
  throw new Error(error ? JSON.stringify(error) : "cloud-cover request failed");
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (the regenerated schema types `param` as `16 | 29`, matching `CloudParam`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api-schema.d.ts backend/*openapi*.json
git commit -m "feat(frontend): pass param to getCloudCover; regen API types"
```

(Adjust the generated-file paths to whatever `make gen-api` actually touched, shown by `git status`.)

---

### Task 8: Dual-axis chart for two parameters

**Files:**
- Modify: `frontend/src/components/CloudCoverChart.tsx`

- [ ] **Step 1: Rewrite the chart to overlay series on two Y-axes**

Replace `frontend/src/components/CloudCoverChart.tsx` entirely with:

```tsx
import { useMemo } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

import type { CloudCover, Resolution } from "../lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

export type CloudSeries = {
  param: number;
  label: string;
  unit: string; // "percent" | "octas"
  color: string;
  data: CloudCover;
};

type Props = {
  series: CloudSeries[];
  resolution: Resolution;
};

function formatLabel(tsMs: number, resolution: Resolution): string {
  const d = new Date(tsMs);
  if (resolution === "monthly") {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  if (resolution === "daily") {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    timeZone: "UTC",
  });
}

export function CloudCoverChart({ series, resolution }: Props) {
  // The two series may come from different stations with different timestamps,
  // so build one sorted union of all bucket timestamps and align each series to
  // it (null where a series has no sample at that timestamp).
  const timeline = useMemo(() => {
    const all = new Set<number>();
    for (const s of series) for (const p of s.data.points) all.add(p.ts);
    return [...all].sort((a, b) => a - b);
  }, [series]);

  const chartData = useMemo(
    () => ({
      labels: timeline.map((ts) => formatLabel(ts, resolution)),
      datasets: series.map((s) => {
        const byTs = new Map(s.data.points.map((p) => [p.ts, p.value]));
        return {
          label: `${s.label} (${s.unit})`,
          data: timeline.map((ts) => (byTs.has(ts) ? byTs.get(ts)! : null)),
          borderColor: s.color,
          backgroundColor: s.color,
          yAxisID: s.unit === "octas" ? "yOctas" : "yPercent",
          spanGaps: false, // leave a gap where value is null (no usable data)
          pointRadius: resolution === "hourly" ? 0 : 2,
          tension: 0.2,
        };
      }),
    }),
    [series, timeline, resolution],
  );

  const hasPercent = series.some((s) => s.unit === "percent");
  const hasOctas = series.some((s) => s.unit === "octas");

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      scales: {
        yPercent: {
          type: "linear" as const,
          display: hasPercent,
          position: "left" as const,
          min: 0,
          max: 100,
          title: { display: true, text: "Total cloud (%)" },
        },
        yOctas: {
          type: "linear" as const,
          display: hasOctas,
          position: "right" as const,
          min: 0,
          max: 8,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Low cloud (octas)" },
        },
        x: {
          ticks: { maxTicksLimit: 8, autoSkip: true },
        },
      },
      plugins: {
        legend: { display: true },
      },
    }),
    [hasPercent, hasOctas],
  );

  return <Line data={chartData} options={options} />;
}
```

- [ ] **Step 2: Typecheck (will fail until App is updated)**

Run: `cd frontend && npm run typecheck`
Expected: FAIL — `App.tsx` still passes the old `data`/`resolution` props to `CloudCoverChart`. This is fixed in Task 9. (Do not commit yet.)

---

### Task 9: App fetches both parameters and overlays them

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Rewrite App to fetch param 16 + 29 in parallel and render the overlay**

Replace `frontend/src/App.tsx` entirely with:

```tsx
import { useCallback, useEffect, useState } from "react";

import { CloudCoverChart } from "./components/CloudCoverChart";
import type { CloudSeries } from "./components/CloudCoverChart";
import { MapView } from "./components/MapView";
import { getCloudCover, getHealth } from "./lib/api";
import type { CloudCover, CloudParam, Resolution } from "./lib/api";

const RESOLUTIONS: Resolution[] = ["hourly", "daily", "monthly"];

const PARAMS: { id: CloudParam; label: string; color: string }[] = [
  { id: 16, label: "Total cloud cover", color: "oklch(60% 0.13 250)" },
  { id: 29, label: "Low cloud amount", color: "oklch(70% 0.17 50)" },
];

type Selection = { lat: number; lon: number };
type ParamResult = { data: CloudCover | null; error: string | null };

export default function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [resolution, setResolution] = useState<Resolution>("daily");
  const [results, setResults] = useState<Record<number, ParamResult>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  // Fetch every parameter in parallel whenever location or resolution changes.
  // Loading is started by the handlers below so this effect only sets state
  // from async callbacks.
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
      setResolution(r);
    },
    [resolution, selection],
  );

  const series: CloudSeries[] = PARAMS.flatMap((p) => {
    const res = results[p.id];
    if (!res?.data || res.data.points.length === 0) return [];
    return [
      {
        param: p.id,
        label: res.data.station.name,
        unit: res.data.unit,
        color: p.color,
        data: res.data,
      },
    ];
  });

  const anyStale = PARAMS.some((p) => results[p.id]?.data?.stale);
  const attribution = PARAMS.map((p) => results[p.id]?.data?.attribution).find(
    Boolean,
  );

  return (
    <div className="flex h-screen">
      <div className="flex-1">
        <MapView onSelect={handleSelect} />
      </div>

      <aside className="flex w-96 flex-col gap-4 overflow-y-auto bg-base-200 p-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">meteo-map-lab</h1>
        </header>

        {!selection ? (
          <p className="text-sm opacity-70">
            Search an address or click the map to compare total and low cloud
            cover for the past year.
          </p>
        ) : (
          <>
            <div className="space-y-1 text-sm">
              {PARAMS.map((p) => {
                const res = results[p.id];
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="font-semibold">{p.label}:</span>
                    {res?.data ? (
                      <span className="opacity-70">
                        {res.data.station.name} ({res.data.station.distance_km}{" "}
                        km)
                      </span>
                    ) : res?.error ? (
                      <span className="opacity-50">{res.error}</span>
                    ) : (
                      <span className="opacity-50">…</span>
                    )}
                  </div>
                );
              })}
              {anyStale && (
                <span className="badge badge-warning badge-sm mt-1">
                  showing cached data
                </span>
              )}
            </div>

            <div role="tablist" className="tabs tabs-box">
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

            {attribution && (
              <p className="text-xs opacity-50">{attribution}</p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck, lint, build**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: PASS for all three.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CloudCoverChart.tsx frontend/src/App.tsx
git commit -m "feat(frontend): overlay param 16 + 29 on a dual-axis chart"
```

---

### Task 10: Update planning docs

**Files:**
- Modify: `ai-docs/PLANNING.md`

- [ ] **Step 1: Mark the multi-parameter work in the SMHI milestone**

Open `ai-docs/PLANNING.md`, find the SMHI-integration milestone section, and add a completed bullet noting that parameter 29 (low-cloud amount, octas) is now served alongside parameter 16 (total cloud, percent), cached identically and overlaid on a dual-axis chart. Match the existing checklist/bullet style in that file.

- [ ] **Step 2: Commit**

```bash
git add ai-docs/PLANNING.md
git commit -m "docs: note multi-parameter (16 + 29) cloud cover in planning"
```

---

## Final verification

- [ ] **Backend:** `cd backend && uv run pytest -q && uv run ruff check app tests` — all green.
- [ ] **Frontend:** `cd frontend && npm run typecheck && npm run lint && npm run build` — all green.
- [ ] **Manual smoke (optional):** `make rebuild` to recreate the cache schema, then `make up`, open the app, click a Swedish location, confirm two lines render (left % axis, right octas axis) with two station labels, and that switching resolution refetches both.
