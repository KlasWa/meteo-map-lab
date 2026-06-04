# SMHI Cloud-Cover Ingest & Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend cloud-coverage ingest + cache layer that, given a coordinate, resolves the nearest SMHI station, lazily caches ~13 months of hourly cloud cover in SQLite, and serves it at hourly/daily/monthly resolution.

**Architecture:** A `CloudCoverService` orchestrates an `SMHIClient` (httpx) and a `CacheRepository` interface (default `SqliteRepository` via SQLModel). The immutable corrected-archive is fetched once; the rolling latest-months window is re-fetched on a 1-hour TTL; both are upserted into one `Observation` table deduped on `(station_id, ts_utc)`. Aggregation to daily/monthly is computed on the fly.

**Tech Stack:** Python 3.12, FastAPI, SQLModel/SQLite, httpx (sync), pytest. No new dependencies.

> **Deviation from spec:** The spec named `asyncio.Lock` and `respx`. The existing backend is fully synchronous, so this plan uses a sync `httpx.Client`, a `threading.Lock`, and httpx's built-in `MockTransport` for tests — keeping the codebase consistent and dependency-free. Behavior is identical.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-31-smhi-cloud-cover-caching-design.md`.

**Conventions for every task:** run commands from the `backend/` directory. Tests run with `pytest`. Lint/format with `ruff`. Commit after each task.

---

## File Structure

**Create:**
- `backend/app/dto.py` — transient dataclasses `ParsedObs`, `StationRaw` (no DB/HTTP deps).
- `backend/app/services/geo.py` — `haversine_km` distance helper.
- `backend/app/models.py` — SQLModel tables `Station`, `Observation`, `FetchLog`.
- `backend/app/services/smhi_parse.py` — `parse_archive_csv`, `parse_recent_json`.
- `backend/app/repositories/__init__.py` — package marker.
- `backend/app/repositories/base.py` — `CacheRepository` ABC.
- `backend/app/repositories/sqlite.py` — `SqliteRepository`.
- `backend/app/services/aggregate.py` — `aggregate(obs, resolution)`.
- `backend/app/services/cloud_cover.py` — `CloudCoverService` + exceptions.
- `backend/app/schemas/cloud_cover.py` — response models.
- `backend/tests/fixtures/archive_sample.csv`, `recent_sample.json`, `station_list_sample.json`.
- `backend/tests/conftest.py` — in-memory repo + fake client fixtures.
- `backend/tests/test_geo.py`, `test_smhi_parse.py`, `test_smhi_client.py`, `test_repository.py`, `test_aggregate.py`, `test_cloud_cover_service.py`, `test_cloud_cover_endpoint.py`.

**Modify:**
- `backend/app/core/config.py` — add cloud-cover settings.
- `backend/app/services/smhi.py` — add fetch methods (keep `get_metrics` stub).
- `backend/app/db/session.py` — import models so `create_all` sees them.
- `backend/app/api/routes.py` — add `/cloud-cover` endpoint + DI.
- `backend/openapi.json` (regenerated in final task).

---

## Task 1: DTOs and geo helper

**Files:**
- Create: `backend/app/dto.py`
- Create: `backend/app/services/geo.py`
- Test: `backend/tests/test_geo.py`

- [ ] **Step 1: Create the DTO module**

Create `backend/app/dto.py`:

```python
"""Transient data-transfer objects shared by the SMHI client, parsers,
repository, and service. Deliberately free of DB and HTTP dependencies."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedObs:
    """One parsed cloud-cover observation, storage-agnostic."""

    ts_utc: int  # epoch milliseconds, UTC
    cloud_pct: float | None  # 0-100, or None when indeterminate/missing
    quality: str  # SMHI quality code: G / Y / R


@dataclass(frozen=True)
class StationRaw:
    """A station as returned by the SMHI parameter listing."""

    id: int
    name: str
    lat: float
    lon: float
    active: bool
    from_ts: int | None = None
    to_ts: int | None = None
```

- [ ] **Step 2: Write the failing geo test**

Create `backend/tests/test_geo.py`:

```python
from app.services.geo import haversine_km


def test_haversine_known_distance():
    # Stockholm (59.33, 18.07) to Gothenburg (57.71, 11.97) ~ 398 km
    d = haversine_km(59.33, 18.07, 57.71, 11.97)
    assert 390 <= d <= 410


def test_haversine_zero_for_same_point():
    assert haversine_km(59.0, 18.0, 59.0, 18.0) == 0.0
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pytest tests/test_geo.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.geo'`.

- [ ] **Step 4: Implement the geo helper**

Create `backend/app/services/geo.py`:

```python
"""Great-circle distance between two WGS84 coordinates."""

from math import asin, cos, radians, sin, sqrt

_EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_KM * asin(sqrt(a))
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pytest tests/test_geo.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add app/dto.py app/services/geo.py tests/test_geo.py
git commit -m "feat(backend): add cloud-cover DTOs and haversine helper"
```

---

## Task 2: SQLModel tables and DB wiring

**Files:**
- Create: `backend/app/models.py`
- Modify: `backend/app/db/session.py`
- Test: `backend/tests/test_models.py`

- [ ] **Step 1: Create the models**

Create `backend/app/models.py`:

```python
"""SQLModel tables for the cloud-cover cache."""

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Station(SQLModel, table=True):
    id: int = Field(primary_key=True)  # SMHI station id
    name: str
    lat: float
    lon: float
    active: bool = True
    from_ts: int | None = None
    to_ts: int | None = None


class Observation(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("station_id", "ts_utc", name="uq_obs_station_ts"),
    )
    id: int | None = Field(default=None, primary_key=True)
    station_id: int = Field(index=True)
    ts_utc: int = Field(index=True)  # epoch ms, UTC
    cloud_pct: float | None = None  # 0-100, None = indeterminate/missing
    quality: str


class FetchLog(SQLModel, table=True):
    """Ledger of what has been fetched. station_id=0 with kind='station_list'
    records the global station-list refresh."""

    __table_args__ = (
        UniqueConstraint("station_id", "kind", name="uq_fetchlog_station_kind"),
    )
    id: int | None = Field(default=None, primary_key=True)
    station_id: int = Field(index=True)
    kind: str  # "archive" | "recent" | "station_list"
    fetched_at: int  # epoch ms
    covered_from: int | None = None
    covered_to: int | None = None
```

- [ ] **Step 2: Wire models into DB init**

Modify `backend/app/db/session.py` — add the models import directly below the existing imports so `SQLModel.metadata` is populated before `create_all`. The current top of the file is:

```python
from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
```

Change it to:

```python
from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401  (registers tables on SQLModel.metadata)
from app.core.config import settings
```

- [ ] **Step 3: Write the failing test**

Create `backend/tests/test_models.py`:

```python
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (ensure tables registered)
from app.models import Observation, Station


def test_tables_create_and_roundtrip():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(Station(id=1, name="Test A", lat=59.0, lon=18.0, active=True))
        s.add(Observation(station_id=1, ts_utc=1000, cloud_pct=50.0, quality="G"))
        s.commit()
        assert s.get(Station, 1).name == "Test A"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pytest tests/test_models.py -v`
Expected: PASS (1 passed). (No separate "fail" run needed — the test depends only on new code that this task creates.)

- [ ] **Step 5: Commit**

```bash
git add app/models.py app/db/session.py tests/test_models.py
git commit -m "feat(backend): add Station/Observation/FetchLog tables"
```

---

## Task 3: Config settings

**Files:**
- Modify: `backend/app/core/config.py`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Add settings fields**

Modify `backend/app/core/config.py`. The current `Settings` body is:

```python
    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./meteo_map_lab.db"
    smhi_base_url: str = "https://opendata-download-metobs.smhi.se/api"
```

Add four fields below `smhi_base_url`:

```python
    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./meteo_map_lab.db"
    smhi_base_url: str = "https://opendata-download-metobs.smhi.se/api"
    cloud_cover_param: int = 16  # SMHI "Total molnmängd", percent
    history_months: int = 13  # how far back to retain/serve
    recent_ttl_seconds: int = 3600  # re-fetch latest-months window after this
    station_list_ttl_days: int = 30  # refresh station list after this
    nearest_max_km: float = 150.0  # reject coordinates with no station within
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_config.py`:

```python
from app.core.config import settings


def test_cloud_cover_defaults():
    assert settings.cloud_cover_param == 16
    assert settings.history_months == 13
    assert settings.recent_ttl_seconds == 3600
    assert settings.station_list_ttl_days == 30
    assert settings.nearest_max_km == 150.0
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pytest tests/test_config.py -v`
Expected: PASS (1 passed).

- [ ] **Step 4: Commit**

```bash
git add app/core/config.py tests/test_config.py
git commit -m "feat(backend): add cloud-cover config settings"
```

---

## Task 4: Parsers (archive CSV + recent JSON)

**Files:**
- Create: `backend/tests/fixtures/archive_sample.csv`
- Create: `backend/tests/fixtures/recent_sample.json`
- Create: `backend/app/services/smhi_parse.py`
- Test: `backend/tests/test_smhi_parse.py`

- [ ] **Step 1: Create the archive CSV fixture**

Create `backend/tests/fixtures/archive_sample.csv` (semicolon-delimited; note the metadata header blocks, the `113` indeterminate value, an empty value, and Y/G codes):

```text
Stationsnamn;Stationsnummer;Stationsnät;Mäthöjd (meter över marken)
Arvika A;92410;SMHIs stationsnät;0.0

Parameternamn;Beskrivning;Enhet
Total molnmängd;momentanvärde, 1 gång/tim;procent

Tidsperiod (fr.o.m);Tidsperiod (t.o.m);Höjd (meter över havet);Latitud (decimalgrader);Longitud (decimalgrader)
1996-04-01 00:00:00;2026-05-01 13:20:22;65.758;59.6743;12.6354

Datum;Tid (UTC);Total molnmängd;Kvalitet;;Tidsutsnitt:
2025-01-01;00:00:00;100;G;;Kvalitetskontrollerade historiska data (utom de senaste 3 mån)
2025-01-01;01:00:00;75;Y;;
2025-01-01;02:00:00;113;G;;
2025-01-01;03:00:00;;G;;
2025-01-01;04:00:00;0;G;;
```

- [ ] **Step 2: Create the recent JSON fixture**

Create `backend/tests/fixtures/recent_sample.json`:

```json
{
  "parameter": { "key": "16", "name": "Total molnmängd", "unit": "procent" },
  "station": { "key": 92410, "name": "Arvika A", "latitude": 59.6743, "longitude": 12.6354 },
  "period": { "key": "latest-months", "from": 1735689600000, "to": 1735700400000 },
  "value": [
    { "date": 1735689600000, "value": "90", "quality": "G" },
    { "date": 1735693200000, "value": "113", "quality": "G" },
    { "date": 1735696800000, "value": "", "quality": "Y" },
    { "date": 1735700400000, "value": "20", "quality": "G" }
  ]
}
```

- [ ] **Step 3: Write the failing parser tests**

Create `backend/tests/test_smhi_parse.py`:

```python
import json
from pathlib import Path

from app.services.smhi_parse import parse_archive_csv, parse_recent_json

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_archive_csv():
    text = (FIXTURES / "archive_sample.csv").read_text(encoding="utf-8")
    obs = parse_archive_csv(text)
    assert len(obs) == 5
    # First row: 2025-01-01 00:00:00 UTC -> 1735689600000 ms
    assert obs[0].ts_utc == 1735689600000
    assert obs[0].cloud_pct == 100.0
    assert obs[0].quality == "G"
    # 113 indeterminate -> None
    assert obs[2].cloud_pct is None
    # empty value -> None
    assert obs[3].cloud_pct is None
    # zero is a real value, not None
    assert obs[4].cloud_pct == 0.0
    assert obs[1].quality == "Y"


def test_parse_recent_json():
    payload = json.loads((FIXTURES / "recent_sample.json").read_text())
    obs = parse_recent_json(payload)
    assert len(obs) == 4
    assert obs[0].ts_utc == 1735689600000
    assert obs[0].cloud_pct == 90.0
    assert obs[1].cloud_pct is None  # 113
    assert obs[2].cloud_pct is None  # empty
    assert obs[3].cloud_pct == 20.0


def test_parse_recent_json_handles_missing_value_key():
    assert parse_recent_json({}) == []
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pytest tests/test_smhi_parse.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.smhi_parse'`.

- [ ] **Step 5: Implement the parsers**

Create `backend/app/services/smhi_parse.py`:

```python
"""Parsers for SMHI cloud-cover responses into ParsedObs.

Archive is semicolon-delimited CSV with several metadata header blocks before
the data rows; recent is JSON with string values. 113 = "cannot determine"
(fog/precip) and empty values both map to None."""

from datetime import datetime, timezone

from app.dto import ParsedObs

_INDETERMINATE = 113.0


def _to_ms(date_str: str, time_str: str) -> int:
    dt = datetime.strptime(
        f"{date_str} {time_str}", "%Y-%m-%d %H:%M:%S"
    ).replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _parse_value(raw: str | None) -> float | None:
    if raw is None:
        return None
    raw = raw.strip()
    if raw == "":
        return None
    value = float(raw)
    return None if value == _INDETERMINATE else value


def parse_archive_csv(text: str) -> list[ParsedObs]:
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
                cloud_pct=_parse_value(raw_val),
                quality=quality.strip(),
            )
        )
    return out


def parse_recent_json(payload: dict) -> list[ParsedObs]:
    out: list[ParsedObs] = []
    for item in payload.get("value") or []:
        out.append(
            ParsedObs(
                ts_utc=int(item["date"]),
                cloud_pct=_parse_value(item.get("value")),
                quality=item.get("quality", ""),
            )
        )
    return out
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pytest tests/test_smhi_parse.py -v`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add app/services/smhi_parse.py tests/fixtures/archive_sample.csv tests/fixtures/recent_sample.json tests/test_smhi_parse.py
git commit -m "feat(backend): parse SMHI archive CSV and recent JSON"
```

---

## Task 5: SMHIClient fetch methods

**Files:**
- Modify: `backend/app/services/smhi.py`
- Create: `backend/tests/fixtures/station_list_sample.json`
- Test: `backend/tests/test_smhi_client.py`

- [ ] **Step 1: Create the station-list fixture**

Create `backend/tests/fixtures/station_list_sample.json`:

```json
{
  "key": "16",
  "station": [
    { "id": 92410, "name": "Arvika A", "latitude": 59.6743, "longitude": 12.6354, "active": true, "from": 828316800000, "to": 1780000000000 },
    { "id": 71420, "name": "Stockholm A", "latitude": 59.3416, "longitude": 18.0548, "active": true, "from": 700000000000, "to": 1780000000000 }
  ]
}
```

- [ ] **Step 2: Write the failing client tests (httpx MockTransport — no network)**

Create `backend/tests/test_smhi_client.py`:

```python
import json
from pathlib import Path

import httpx

from app.services.smhi import SMHIClient

FIXTURES = Path(__file__).parent / "fixtures"


def _client_with(handler) -> SMHIClient:
    transport = httpx.MockTransport(handler)
    return SMHIClient(
        base_url="https://example.test/api", param=16, transport=transport
    )


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


def test_fetch_recent_returns_json():
    payload = json.loads((FIXTURES / "recent_sample.json").read_text())

    def handler(request: httpx.Request) -> httpx.Response:
        assert "latest-months/data.json" in request.url.path
        assert "/station/92410/" in request.url.path
        return httpx.Response(200, json=payload)

    data = _client_with(handler).fetch_recent(92410)
    assert data["value"][0]["value"] == "90"


def test_fetch_archive_returns_text():
    csv_text = (FIXTURES / "archive_sample.csv").read_text()

    def handler(request: httpx.Request) -> httpx.Response:
        assert "corrected-archive/data.csv" in request.url.path
        return httpx.Response(200, text=csv_text)

    text = _client_with(92410 and handler).fetch_archive(92410)
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

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest tests/test_smhi_client.py -v`
Expected: FAIL — `SMHIClient` has no `fetch_station_list` / `transport` parameter yet.

- [ ] **Step 4: Extend SMHIClient**

Replace the contents of `backend/app/services/smhi.py` with (keeps the existing `get_metrics` stub so `/metrics` keeps working):

```python
"""SMHI Open Data client for cloud cover (parameter 16).

Synchronous httpx client. Real cloud-cover fetching lives here; the legacy
get_metrics stub is retained for the existing /metrics endpoint."""

import httpx

from app.dto import StationRaw
from app.schemas.metrics import MetricsResponse

_API_VERSION = "1.0"


class SMHIClient:
    def __init__(
        self,
        base_url: str,
        param: int = 16,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self.param = param
        self._client = httpx.Client(
            base_url=base_url, timeout=timeout, transport=transport
        )

    def fetch_station_list(self) -> list[StationRaw]:
        r = self._client.get(f"/version/{_API_VERSION}/parameter/{self.param}.json")
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

    def fetch_recent(self, station_id: int) -> dict:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{self.param}"
            f"/station/{station_id}/period/latest-months/data.json"
        )
        r.raise_for_status()
        return r.json()

    def fetch_archive(self, station_id: int) -> str:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{self.param}"
            f"/station/{station_id}/period/corrected-archive/data.csv"
        )
        r.raise_for_status()
        return r.text

    def get_metrics(self, lat: float, lon: float) -> MetricsResponse:
        # TODO: superseded by CloudCoverService; retained for /metrics stub.
        return MetricsResponse(
            lat=lat,
            lon=lon,
            cloud_cover_pct=0.0,
            lightning_probability=0.0,
            note="stub data",
        )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_smhi_client.py -v`
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add app/services/smhi.py tests/fixtures/station_list_sample.json tests/test_smhi_client.py
git commit -m "feat(backend): add SMHI fetch methods (station list, recent, archive)"
```

---

## Task 6: CacheRepository interface

**Files:**
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/repositories/base.py`

- [ ] **Step 1: Create the package marker**

Create `backend/app/repositories/__init__.py` (empty file):

```python
```

- [ ] **Step 2: Create the ABC**

Create `backend/app/repositories/base.py`:

```python
"""Storage-agnostic cache interface. SqliteRepository is the default impl;
a Parquet/DuckDB impl could be swapped in without touching the service."""

from abc import ABC, abstractmethod

from app.dto import ParsedObs, StationRaw
from app.models import FetchLog


class CacheRepository(ABC):
    @abstractmethod
    def upsert_stations(self, stations: list[StationRaw]) -> None: ...

    @abstractmethod
    def station_count(self) -> int: ...

    @abstractmethod
    def nearest_station(
        self, lat: float, lon: float, max_km: float
    ) -> StationRaw | None: ...

    @abstractmethod
    def upsert_observations(
        self, station_id: int, obs: list[ParsedObs]
    ) -> None: ...

    @abstractmethod
    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int
    ) -> list[ParsedObs]: ...

    @abstractmethod
    def get_fetch_log(self, station_id: int, kind: str) -> FetchLog | None: ...

    @abstractmethod
    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
    ) -> None: ...
```

- [ ] **Step 3: Verify it imports cleanly**

Run: `python -c "from app.repositories.base import CacheRepository; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add app/repositories/__init__.py app/repositories/base.py
git commit -m "feat(backend): add CacheRepository interface"
```

---

## Task 7: SqliteRepository

**Files:**
- Create: `backend/app/repositories/sqlite.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_repository.py`

- [ ] **Step 1: Add the shared in-memory engine fixture**

Create `backend/tests/conftest.py`:

```python
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401  (register tables)
from app.repositories.sqlite import SqliteRepository


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


@pytest.fixture
def repo(engine):
    return SqliteRepository(engine)
```

- [ ] **Step 2: Write the failing repository tests**

Create `backend/tests/test_repository.py`:

```python
from app.dto import ParsedObs, StationRaw


def _stations():
    return [
        StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True),
        StationRaw(id=2, name="Far", lat=55.0, lon=13.0, active=True),
    ]


def test_upsert_stations_and_count(repo):
    repo.upsert_stations(_stations())
    assert repo.station_count() == 2
    # Idempotent upsert: same ids, updated name
    repo.upsert_stations([StationRaw(id=1, name="Renamed", lat=59.0, lon=18.0, active=True)])
    assert repo.station_count() == 2


def test_nearest_station_picks_closest(repo):
    repo.upsert_stations(_stations())
    nearest = repo.nearest_station(59.1, 18.1, max_km=150.0)
    assert nearest is not None
    assert nearest.id == 1


def test_nearest_station_respects_max_km(repo):
    repo.upsert_stations(_stations())
    assert repo.nearest_station(0.0, 0.0, max_km=150.0) is None


def test_upsert_observations_dedupes_on_station_ts(repo):
    repo.upsert_stations(_stations())
    repo.upsert_observations(1, [ParsedObs(1000, 50.0, "Y")])
    # Same (station, ts) again with a corrected value -> overwrite, not duplicate
    repo.upsert_observations(1, [ParsedObs(1000, 60.0, "G")])
    rows = repo.get_observations(1, 0, 2000)
    assert len(rows) == 1
    assert rows[0].cloud_pct == 60.0
    assert rows[0].quality == "G"


def test_get_observations_filters_range_and_sorts(repo):
    repo.upsert_stations(_stations())
    repo.upsert_observations(1, [
        ParsedObs(3000, 30.0, "G"),
        ParsedObs(1000, 10.0, "G"),
        ParsedObs(5000, 50.0, "G"),
    ])
    rows = repo.get_observations(1, 1000, 3000)
    assert [r.ts_utc for r in rows] == [1000, 3000]


def test_fetch_log_record_and_get(repo):
    assert repo.get_fetch_log(1, "recent") is None
    repo.record_fetch(1, "recent", fetched_at=100, covered_from=10, covered_to=90)
    log = repo.get_fetch_log(1, "recent")
    assert log.fetched_at == 100
    # Re-record updates in place (no duplicate row)
    repo.record_fetch(1, "recent", fetched_at=200, covered_from=10, covered_to=190)
    log2 = repo.get_fetch_log(1, "recent")
    assert log2.fetched_at == 200
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest tests/test_repository.py -v`
Expected: FAIL — `app.repositories.sqlite` does not exist.

- [ ] **Step 4: Implement SqliteRepository**

Create `backend/app/repositories/sqlite.py`:

```python
"""SQLite-backed CacheRepository using SQLModel."""

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

    def upsert_stations(self, stations: list[StationRaw]) -> None:
        if not stations:
            return
        rows = [
            {
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
            index_elements=["id"],
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

    def station_count(self) -> int:
        with Session(self._engine) as s:
            return len(s.exec(select(Station.id)).all())

    def nearest_station(
        self, lat: float, lon: float, max_km: float
    ) -> StationRaw | None:
        with Session(self._engine) as s:
            stations = s.exec(select(Station)).all()
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
        self, station_id: int, obs: list[ParsedObs]
    ) -> None:
        if not obs:
            return
        rows = [
            {
                "station_id": station_id,
                "ts_utc": o.ts_utc,
                "cloud_pct": o.cloud_pct,
                "quality": o.quality,
            }
            for o in obs
        ]
        stmt = sqlite_insert(Observation).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["station_id", "ts_utc"],
            set_={
                "cloud_pct": stmt.excluded.cloud_pct,
                "quality": stmt.excluded.quality,
            },
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int
    ) -> list[ParsedObs]:
        with Session(self._engine) as s:
            rows = s.exec(
                select(Observation)
                .where(
                    Observation.station_id == station_id,
                    Observation.ts_utc >= start_ts,
                    Observation.ts_utc <= end_ts,
                )
                .order_by(Observation.ts_utc)
            ).all()
        return [ParsedObs(r.ts_utc, r.cloud_pct, r.quality) for r in rows]

    def get_fetch_log(self, station_id: int, kind: str) -> FetchLog | None:
        with Session(self._engine) as s:
            return s.exec(
                select(FetchLog).where(
                    FetchLog.station_id == station_id, FetchLog.kind == kind
                )
            ).first()

    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
    ) -> None:
        with Session(self._engine) as s:
            existing = s.exec(
                select(FetchLog).where(
                    FetchLog.station_id == station_id, FetchLog.kind == kind
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
                        station_id=station_id,
                        kind=kind,
                        fetched_at=fetched_at,
                        covered_from=covered_from,
                        covered_to=covered_to,
                    )
                )
            s.commit()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_repository.py -v`
Expected: PASS (6 passed).

- [ ] **Step 6: Commit**

```bash
git add app/repositories/sqlite.py tests/conftest.py tests/test_repository.py
git commit -m "feat(backend): implement SqliteRepository"
```

---

## Task 8: Aggregation + response schemas

**Files:**
- Create: `backend/app/schemas/cloud_cover.py`
- Create: `backend/app/services/aggregate.py`
- Test: `backend/tests/test_aggregate.py`

- [ ] **Step 1: Create the response schemas**

Create `backend/app/schemas/cloud_cover.py`:

```python
from pydantic import BaseModel


class CloudPoint(BaseModel):
    ts: int  # epoch ms, UTC (bucket start for daily/monthly)
    value: float | None  # mean cloud %, None when no usable samples
    count: int  # usable (non-null) samples in the bucket


class StationInfo(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    distance_km: float


class CloudCoverResponse(BaseModel):
    station: StationInfo
    resolution: str
    unit: str = "percent"
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[CloudPoint]
```

- [ ] **Step 2: Write the failing aggregation tests**

Create `backend/tests/test_aggregate.py`:

```python
from app.dto import ParsedObs
from app.services.aggregate import aggregate

# 2025-01-01 00:00, 12:00 UTC and 2025-01-02 00:00 UTC
T_JAN1_00 = 1735689600000
T_JAN1_12 = 1735732800000
T_JAN2_00 = 1735776000000


def test_hourly_passthrough_with_count():
    obs = [ParsedObs(T_JAN1_00, 80.0, "G"), ParsedObs(T_JAN1_12, None, "G")]
    points = aggregate(obs, "hourly")
    assert [p.ts for p in points] == [T_JAN1_00, T_JAN1_12]
    assert points[0].value == 80.0 and points[0].count == 1
    assert points[1].value is None and points[1].count == 0


def test_daily_mean_excludes_none():
    obs = [
        ParsedObs(T_JAN1_00, 100.0, "G"),
        ParsedObs(T_JAN1_12, 50.0, "G"),
        ParsedObs(T_JAN2_00, None, "G"),
    ]
    points = aggregate(obs, "daily")
    assert len(points) == 2
    assert points[0].value == 75.0 and points[0].count == 2
    assert points[1].value is None and points[1].count == 0
    # bucket ts is UTC midnight of that day
    assert points[0].ts == T_JAN1_00
    assert points[1].ts == T_JAN2_00


def test_monthly_mean_buckets_to_first_of_month():
    obs = [ParsedObs(T_JAN1_00, 40.0, "G"), ParsedObs(T_JAN2_00, 60.0, "G")]
    points = aggregate(obs, "monthly")
    assert len(points) == 1
    assert points[0].value == 50.0 and points[0].count == 2
    assert points[0].ts == T_JAN1_00  # 2025-01-01 00:00 UTC
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pytest tests/test_aggregate.py -v`
Expected: FAIL — `app.services.aggregate` does not exist.

- [ ] **Step 4: Implement aggregation**

Create `backend/app/services/aggregate.py`:

```python
"""Aggregate hourly observations into hourly/daily/monthly points (UTC)."""

from datetime import datetime, timezone

from app.dto import ParsedObs
from app.schemas.cloud_cover import CloudPoint


def _day_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def _month_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def aggregate(obs: list[ParsedObs], resolution: str) -> list[CloudPoint]:
    if resolution == "hourly":
        return [
            CloudPoint(
                ts=o.ts_utc,
                value=o.cloud_pct,
                count=0 if o.cloud_pct is None else 1,
            )
            for o in obs
        ]

    key_fn = _day_key if resolution == "daily" else _month_key
    buckets: dict[int, list[float | None]] = {}
    for o in obs:
        buckets.setdefault(key_fn(o.ts_utc), []).append(o.cloud_pct)

    points: list[CloudPoint] = []
    for key in sorted(buckets):
        usable = [v for v in buckets[key] if v is not None]
        value = round(sum(usable) / len(usable), 2) if usable else None
        points.append(CloudPoint(ts=key, value=value, count=len(usable)))
    return points
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pytest tests/test_aggregate.py -v`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add app/schemas/cloud_cover.py app/services/aggregate.py tests/test_aggregate.py
git commit -m "feat(backend): add cloud-cover aggregation and response schemas"
```

---

## Task 9: CloudCoverService — ingest logic

**Files:**
- Create: `backend/app/services/cloud_cover.py`
- Test: `backend/tests/test_cloud_cover_service.py`

- [ ] **Step 1: Write the failing service tests (fake client + real in-memory repo)**

Create `backend/tests/test_cloud_cover_service.py`:

```python
import httpx
import pytest

from app.core.config import settings
from app.dto import ParsedObs, StationRaw
from app.services.cloud_cover import (
    CloudCoverService,
    NoStationFound,
    SMHIUnavailable,
)

NOW = 1_800_000_000_000  # fixed "now" in ms


class FakeClient:
    def __init__(self):
        self.station_calls = 0
        self.recent_calls = 0
        self.archive_calls = 0
        self.fail_recent = False

    def fetch_station_list(self):
        self.station_calls += 1
        return [StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True)]

    def fetch_recent(self, station_id):
        self.recent_calls += 1
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        return {"value": [{"date": NOW - 3600_000, "value": "40", "quality": "G"}]}

    def fetch_archive(self, station_id):
        self.archive_calls += 1
        # one point inside 13 months, one ancient point that must be dropped
        return (
            "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n"
            "2025-01-01;00:00:00;80;G;;\n"
            "1990-01-01;00:00:00;10;G;;\n"
        )


def _service(repo, client):
    return CloudCoverService(client, repo, settings)


def test_ensure_cached_fetches_both_then_skips_archive(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.repo.upsert_stations(client.fetch_station_list())  # seed stations

    svc.ensure_cached(1, now_ms=NOW)
    assert client.recent_calls == 1
    assert client.archive_calls == 1

    # Second call within TTL: no recent re-fetch, archive already cached
    svc.ensure_cached(1, now_ms=NOW + 60_000)
    assert client.recent_calls == 1
    assert client.archive_calls == 1


def test_archive_drops_rows_older_than_history(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.ensure_cached(1, now_ms=NOW)
    rows = repo.get_observations(1, 0, NOW)
    # 1990 row dropped; 2025 archive row + recent row remain
    assert all(r.ts_utc > NOW - svc.history_ms for r in rows)


def test_recent_refetched_after_ttl(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.ensure_cached(1, now_ms=NOW)
    svc.ensure_cached(1, now_ms=NOW + settings.recent_ttl_seconds * 1000 + 1)
    assert client.recent_calls == 2
    assert client.archive_calls == 1  # archive still once


def test_recent_failure_raises_smhi_unavailable(repo):
    client = FakeClient()
    client.fail_recent = True
    svc = _service(repo, client)
    with pytest.raises(SMHIUnavailable):
        svc.ensure_cached(1, now_ms=NOW)
    # No recent ledger written -> will retry next time
    assert repo.get_fetch_log(1, "recent") is None


def test_get_cloud_cover_happy_path(repo):
    client = FakeClient()
    svc = _service(repo, client)
    resp = svc.get_cloud_cover(59.05, 18.05, "daily", now_ms=NOW)
    assert resp.station.id == 1
    assert resp.resolution == "daily"
    assert resp.stale is False
    assert len(resp.points) >= 1
    assert resp.station.distance_km >= 0


def test_get_cloud_cover_no_station(repo):
    client = FakeClient()
    svc = _service(repo, client)
    with pytest.raises(NoStationFound):
        svc.get_cloud_cover(0.0, 0.0, "daily", now_ms=NOW)


def test_get_cloud_cover_stale_when_refresh_fails_but_cache_exists(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.get_cloud_cover(59.05, 18.05, "daily", now_ms=NOW)  # warm cache
    client.fail_recent = True
    resp = svc.get_cloud_cover(
        59.05, 18.05, "daily",
        now_ms=NOW + settings.recent_ttl_seconds * 1000 + 1,
    )
    assert resp.stale is True
    assert len(resp.points) >= 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_cloud_cover_service.py -v`
Expected: FAIL — `app.services.cloud_cover` does not exist.

- [ ] **Step 3: Implement the service**

Create `backend/app/services/cloud_cover.py`:

```python
"""Orchestrates SMHI fetching, caching, and aggregation for cloud cover."""

import time
from threading import Lock

import httpx

from app.repositories.base import CacheRepository
from app.schemas.cloud_cover import CloudCoverResponse, StationInfo
from app.services.aggregate import aggregate
from app.services.geo import haversine_km
from app.services.smhi import SMHIClient
from app.services.smhi_parse import parse_archive_csv, parse_recent_json

ARCHIVE = "archive"
RECENT = "recent"
STATION_LIST = "station_list"
_STATION_LIST_ID = 0
_MONTH_MS = 30 * 24 * 3600 * 1000
_YEAR_MS = 365 * 24 * 3600 * 1000


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
        self._locks: dict[int, Lock] = {}
        self._locks_guard = Lock()

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def _lock_for(self, station_id: int) -> Lock:
        with self._locks_guard:
            lock = self._locks.get(station_id)
            if lock is None:
                lock = Lock()
                self._locks[station_id] = lock
            return lock

    def ensure_station_list(self, now_ms: int) -> None:
        log = self.repo.get_fetch_log(_STATION_LIST_ID, STATION_LIST)
        fresh = log is not None and now_ms - log.fetched_at <= self.station_list_ttl_ms
        if fresh:
            return
        try:
            stations = self.client.fetch_station_list()
        except httpx.HTTPError as exc:
            if self.repo.station_count() == 0:
                raise SMHIUnavailable(str(exc)) from exc
            return  # keep using the existing (stale) list
        self.repo.upsert_stations(stations)
        self.repo.record_fetch(_STATION_LIST_ID, STATION_LIST, now_ms, None, None)

    def ensure_cached(self, station_id: int, now_ms: int) -> None:
        # Recent window: refresh when missing or older than TTL.
        recent_log = self.repo.get_fetch_log(station_id, RECENT)
        if recent_log is None or now_ms - recent_log.fetched_at > self.recent_ttl_ms:
            try:
                payload = self.client.fetch_recent(station_id)
            except httpx.HTTPError as exc:
                raise SMHIUnavailable(str(exc)) from exc
            obs = parse_recent_json(payload)
            self.repo.upsert_observations(station_id, obs)
            self.repo.record_fetch(
                station_id, RECENT, now_ms, _min_ts(obs), _max_ts(obs)
            )

        # Archive: fetch once, then never again (immutable).
        archive_log = self.repo.get_fetch_log(station_id, ARCHIVE)
        if archive_log is None:
            try:
                text = self.client.fetch_archive(station_id)
            except httpx.HTTPError as exc:
                raise SMHIUnavailable(str(exc)) from exc
            cutoff = now_ms - self.history_ms
            obs = [o for o in parse_archive_csv(text) if o.ts_utc >= cutoff]
            self.repo.upsert_observations(station_id, obs)
            self.repo.record_fetch(
                station_id, ARCHIVE, now_ms, _min_ts(obs), _max_ts(obs)
            )

    def get_cloud_cover(
        self,
        lat: float,
        lon: float,
        resolution: str,
        now_ms: int | None = None,
    ) -> CloudCoverResponse:
        now_ms = now_ms if now_ms is not None else self._now_ms()
        self.ensure_station_list(now_ms)

        station = self.repo.nearest_station(lat, lon, self.nearest_max_km)
        if station is None:
            raise NoStationFound(
                f"No SMHI station within {self.nearest_max_km} km of "
                f"({lat}, {lon})."
            )

        stale = False
        with self._lock_for(station.id):
            try:
                self.ensure_cached(station.id, now_ms)
            except SMHIUnavailable:
                stale = True

        obs = self.repo.get_observations(station.id, now_ms - _YEAR_MS, now_ms)
        if not obs and stale:
            raise SMHIUnavailable(
                "SMHI is unavailable and no cached data exists for this station."
            )

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
            resolution=resolution,
            stale=stale,
            points=points,
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_cloud_cover_service.py -v`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add app/services/cloud_cover.py tests/test_cloud_cover_service.py
git commit -m "feat(backend): add CloudCoverService ingest + read logic"
```

---

## Task 10: `/api/cloud-cover` endpoint

**Files:**
- Modify: `backend/app/api/routes.py`
- Test: `backend/tests/test_cloud_cover_endpoint.py`

- [ ] **Step 1: Write the failing endpoint tests**

Create `backend/tests/test_cloud_cover_endpoint.py`:

```python
import httpx
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401
from app.api.routes import get_cloud_cover_service
from app.core.config import settings
from app.dto import StationRaw
from app.main import app
from app.repositories.sqlite import SqliteRepository
from app.services.cloud_cover import CloudCoverService

NOW = 1_800_000_000_000


class FakeClient:
    def __init__(self):
        self.fail_recent = False

    def fetch_station_list(self):
        return [StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True)]

    def fetch_recent(self, station_id):
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        return {"value": [{"date": NOW - 3600_000, "value": "40", "quality": "G"}]}

    def fetch_archive(self, station_id):
        return "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n2025-01-01;00:00:00;80;G;;\n"


def _make_service(fake):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    # Service uses _now_ms() in the endpoint path; freeze it for determinism.
    svc = CloudCoverService(fake, SqliteRepository(engine), settings)
    svc._now_ms = lambda: NOW
    return svc


def _client_with(svc) -> TestClient:
    app.dependency_overrides[get_cloud_cover_service] = lambda: svc
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_cloud_cover_daily_ok():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05, "resolution": "daily"})
    assert r.status_code == 200
    body = r.json()
    assert body["station"]["id"] == 1
    assert body["resolution"] == "daily"
    assert body["unit"] == "percent"
    assert body["stale"] is False
    assert "SMHI" in body["attribution"]
    assert len(body["points"]) >= 1


def test_cloud_cover_default_resolution_is_daily():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05})
    assert r.status_code == 200
    assert r.json()["resolution"] == "daily"


def test_cloud_cover_invalid_resolution_is_422():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.0, "lon": 18.0, "resolution": "weekly"})
    assert r.status_code == 422


def test_cloud_cover_no_station_is_404():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 0.0, "lon": 0.0})
    assert r.status_code == 404


def test_cloud_cover_503_when_unavailable_and_cold():
    fake = FakeClient()
    fake.fail_recent = True
    svc = _make_service(fake)
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05})
    assert r.status_code == 503
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest tests/test_cloud_cover_endpoint.py -v`
Expected: FAIL — `get_cloud_cover_service` / `/api/cloud-cover` do not exist.

- [ ] **Step 3: Add the endpoint and dependency**

The existing `routes.py` keeps `/health` (with `HealthResponse`) and
`/api/metrics` (with `MetricsResponse`) — **do not change those**, the frontend
calls `/api/metrics` and `tests/test_health.py` asserts both. Replace the
contents of `backend/app/api/routes.py` with the following, which preserves the
existing routes verbatim and adds `/api/cloud-cover` (same `/api/` prefix as
metrics):

```python
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.schemas.cloud_cover import CloudCoverResponse
from app.schemas.metrics import HealthResponse, MetricsResponse
from app.services.cloud_cover import (
    CloudCoverService,
    NoStationFound,
    SMHIUnavailable,
)
from app.services.smhi import SMHIClient

router = APIRouter()
_smhi = SMHIClient(settings.smhi_base_url)

_service: CloudCoverService | None = None


def get_cloud_cover_service() -> CloudCoverService:
    """Lazily build a process-wide CloudCoverService. Overridable in tests via
    app.dependency_overrides."""
    global _service
    if _service is None:
        from app.db.session import engine
        from app.repositories.sqlite import SqliteRepository

        client = SMHIClient(
            base_url=settings.smhi_base_url, param=settings.cloud_cover_param
        )
        _service = CloudCoverService(client, SqliteRepository(engine), settings)
    return _service


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/api/metrics", response_model=MetricsResponse, tags=["metrics"])
def metrics(lat: float, lon: float) -> MetricsResponse:
    return _smhi.get_metrics(lat, lon)


@router.get(
    "/api/cloud-cover",
    response_model=CloudCoverResponse,
    tags=["cloud-cover"],
)
def cloud_cover(
    lat: float,
    lon: float,
    resolution: Literal["hourly", "daily", "monthly"] = "daily",
    service: CloudCoverService = Depends(get_cloud_cover_service),
) -> CloudCoverResponse:
    try:
        return service.get_cloud_cover(lat, lon, resolution)
    except NoStationFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SMHIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
```

> Note: `app.db.session` must expose `engine` at module level (it already
> creates `engine = create_engine(...)` in Task 2's file). The lazy import
> avoids creating the DB engine at import time during tests that override the
> dependency.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pytest tests/test_cloud_cover_endpoint.py -v`
Expected: PASS (5 passed).

- [ ] **Step 5: Run the full suite**

Run: `pytest -q`
Expected: all tests pass (no failures).

- [ ] **Step 6: Commit**

```bash
git add app/api/routes.py tests/test_cloud_cover_endpoint.py
git commit -m "feat(backend): add /api/cloud-cover endpoint"
```

---

## Task 11: Lint, regenerate OpenAPI, update env example

**Files:**
- Modify: `backend/openapi.json` (regenerated)
- Modify: `backend/.env.example`
- Modify: `frontend/src/lib/api-schema.d.ts` (regenerated, if frontend toolchain available)

- [ ] **Step 1: Lint and format**

Run: `ruff check . && ruff format .`
Expected: no errors (formatter may reformat; re-run `ruff check .` until clean).

- [ ] **Step 2: Document the new env knobs**

Append to `backend/.env.example`:

```text
# Cloud-cover cache tuning (optional; defaults shown)
CLOUD_COVER_PARAM=16
HISTORY_MONTHS=13
RECENT_TTL_SECONDS=3600
STATION_LIST_TTL_DAYS=30
NEAREST_MAX_KM=150.0
```

- [ ] **Step 3: Regenerate the OpenAPI schema**

Run: `python scripts/export_openapi.py`
Expected: `openapi.json` updated; `git diff openapi.json` shows the new `/cloud-cover` path and `CloudCoverResponse`/`CloudPoint`/`StationInfo` schemas.

- [ ] **Step 4: Regenerate frontend types (if the frontend toolchain is available)**

Run (from repo root): `cd frontend && npm run gen:types`
Expected: `frontend/src/lib/api-schema.d.ts` updated with the new path. If npm/node is unavailable in this environment, skip and note that `make gen-api` must be run later.

- [ ] **Step 5: Run the full suite once more**

Run (from `backend/`): `pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/openapi.json backend/.env.example frontend/src/lib/api-schema.d.ts
git commit -m "chore(backend): regenerate OpenAPI and document cloud-cover env vars"
```

---

## Self-Review Notes

**Spec coverage:** Every spec section maps to a task — SMHI client (T5), parsers (T4), repository interface + SQLite (T6/T7), data model (T2), refresh/TTL + archive-once + stale-serve + per-station lock (T9), aggregation hourly/daily/monthly (T8), endpoint + 404/503/422 (T10), config knobs (T3), testing throughout, attribution in the response schema (T8).

**Edge cases covered by tests:** `113`/empty → None (T4, T8), upsert dedupe on overlap (T7), archive history cutoff (T9), recent TTL re-fetch (T9), partial-ingest stale serve (T9/T10), no-station 404 (T9/T10), cold-cache 503 (T9/T10).

**Deferred (per spec §9):** scheduled refresh, multi-station regions, quality-code filtering, Parquet/DuckDB repo, lightning. The repository interface (T6) and the now_ms-injectable ingest function (T9) leave clean seams for the first two.

**Determinism:** `now_ms` is injected everywhere time matters; tests pass a fixed `NOW`, satisfying the no-`Date.now()` reproducibility concern.
