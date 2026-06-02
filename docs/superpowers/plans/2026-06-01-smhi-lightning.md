# SMHI Lightning Strikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch, cache, aggregate, and chart SMHI lightning-strike counts within a fixed radius of a selected location, over the past ~12 months, on its own bar chart below the cloud chart.

**Architecture:** National per-day strike files are fetched lazily (concurrently), parsed into individual strike rows, and stored in SQLite; immutable past days are fetched once, today/yesterday re-fetched on a TTL. A request computes a bbox+radius around the point, filters strikes, and buckets them into hourly/daily/monthly counts. Lightning lives in its own modules/tables, separate from cloud cover.

**Tech Stack:** FastAPI, SQLModel/SQLite, httpx, `concurrent.futures` (backend); React 19, TypeScript, Chart.js (frontend).

**Reference:** spec at `docs/superpowers/specs/2026-06-01-smhi-lightning-design.md`.

**Before manual testing:** the schema gains tables in Task 3 — recreate the dev cache with `make reset-db` before running the stack manually. The test suite uses in-memory SQLite and needs no reset.

---

### Task 1: Lightning settings

**Files:**
- Modify: `backend/app/core/config.py`
- Test: `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test** — append to `test_cloud_cover_defaults` in `backend/tests/test_config.py` (after the existing assertions, before the function ends):

```python
    assert settings.lightning_radius_km == 50.0
    assert settings.lightning_history_months == 12
    assert settings.lightning_recent_ttl_seconds == 3600
    assert settings.lightning_fetch_workers == 8
    assert "lightning" in settings.lightning_base_url
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_config.py -v`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'lightning_radius_km'`

- [ ] **Step 3: Add the settings** — in `backend/app/core/config.py`, add after the `nearest_max_km` block (before the closing of the class):

```python
    lightning_base_url: str = (
        "https://opendata-download-lightning.smhi.se/api/version/latest"
    )
    lightning_radius_km: float = 50.0  # count strikes within this radius
    lightning_history_months: int = 12  # how far back to retain/serve
    lightning_recent_ttl_seconds: int = 3600  # re-fetch today/yesterday after this
    lightning_fetch_workers: int = 8  # parallel day-file fetches on cold start
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/tests/test_config.py
git commit -m "feat(backend): add lightning settings"
```

---

### Task 2: Shared time-bucket helpers (DRY refactor)

**Files:**
- Create: `backend/app/services/timebuckets.py`
- Modify: `backend/app/services/aggregate.py`
- Test: `backend/tests/test_timebuckets.py`

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_timebuckets.py`:

```python
from app.services.timebuckets import day_key, hour_key, month_key

# 2024-07-15 13:37:00 UTC = 1721050620000 ms
TS = 1721050620000


def test_hour_key_floors_to_hour():
    # 2024-07-15 13:00:00 UTC
    assert hour_key(TS) == 1721048400000


def test_day_key_floors_to_utc_midnight():
    # 2024-07-15 00:00:00 UTC
    assert day_key(TS) == 1721001600000


def test_month_key_floors_to_first_of_month():
    # 2024-07-01 00:00:00 UTC
    assert month_key(TS) == 1719792000000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_timebuckets.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.timebuckets'`

- [ ] **Step 3: Create the module** — `backend/app/services/timebuckets.py`:

```python
"""UTC time-bucket keys (epoch ms of the bucket start). Shared by the cloud and
lightning aggregators."""

from datetime import datetime, timezone


def hour_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, dt.day, dt.hour, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def day_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def month_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)
```

- [ ] **Step 4: Refactor the cloud aggregator to use it** — replace the top of `backend/app/services/aggregate.py` (the imports and the two private key functions, lines 1–18) with:

```python
"""Aggregate hourly observations into hourly/daily/monthly points (UTC)."""

from app.dto import ParsedObs
from app.schemas.cloud_cover import CloudPoint
from app.services.timebuckets import day_key, month_key
```

Then in the same file change the `aggregate` body's key selection line from
`key_fn = _day_key if resolution == "daily" else _month_key` to:

```python
    key_fn = day_key if resolution == "daily" else month_key
```

(The `datetime, timezone` import is no longer needed in `aggregate.py`.)

- [ ] **Step 5: Run the full suite**

Run: `cd backend && uv run pytest -q`
Expected: PASS (timebuckets tests + existing cloud aggregate tests still green). Then `cd backend && uv run ruff check app tests` → clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/timebuckets.py backend/app/services/aggregate.py backend/tests/test_timebuckets.py
git commit -m "refactor(backend): extract shared UTC time-bucket helpers"
```

---

### Task 3: StrikeRaw DTO + lightning models

**Files:**
- Modify: `backend/app/dto.py`, `backend/app/models.py`
- Test: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing test** — append to `backend/tests/test_models.py`:

```python
def test_lightning_tables_roundtrip():
    from sqlalchemy.pool import StaticPool
    from sqlmodel import Session, SQLModel, create_engine

    from app.models import LightningDay, LightningStrike

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(
            LightningStrike(
                ts_utc=1721050620000,
                lat=58.6,
                lon=17.2,
                peak_current=-6.0,
                cloud_indicator=1,
            )
        )
        s.add(LightningDay(day_start_ms=1721001600000, fetched_at=1, count=1))
        s.commit()
        assert s.get(LightningDay, 1721001600000).count == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_models.py::test_lightning_tables_roundtrip -v`
Expected: FAIL — `ImportError: cannot import name 'LightningStrike'`

- [ ] **Step 3: Add the DTO** — append to `backend/app/dto.py`:

```python
@dataclass(frozen=True)
class StrikeRaw:
    """One parsed lightning strike, storage-agnostic."""

    ts_utc: int  # epoch milliseconds, UTC
    lat: float
    lon: float
    peak_current: float  # kA, sign = polarity
    cloud_indicator: int  # 0/1: ground vs cloud flash
```

- [ ] **Step 4: Add the models** — append to `backend/app/models.py`:

```python
class LightningStrike(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("ts_utc", "lat", "lon", name="uq_strike_ts_lat_lon"),
    )
    id: int | None = Field(default=None, primary_key=True)
    ts_utc: int = Field(index=True)  # epoch ms, UTC
    lat: float = Field(index=True)  # indexed for bbox prefilter
    lon: float
    peak_current: float
    cloud_indicator: int


class LightningDay(SQLModel, table=True):
    """Fetch ledger: one row per fetched UTC day (0-strike days included so we
    do not re-fetch empties)."""

    day_start_ms: int = Field(primary_key=True)  # UTC midnight, epoch ms
    fetched_at: int  # epoch ms
    count: int
```

(`UniqueConstraint` and `Field`/`SQLModel` are already imported at the top of `models.py`.)

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/test_models.py -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/dto.py backend/app/models.py backend/tests/test_models.py
git commit -m "feat(backend): add lightning strike + day-ledger models"
```

---

### Task 4: Lightning day parser

**Files:**
- Create: `backend/app/services/lightning_parse.py`
- Test: `backend/tests/test_lightning_parse.py`

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_lightning_parse.py`:

```python
from app.services.lightning_parse import parse_day


def _record(**over):
    base = {
        "year": 2024,
        "month": 7,
        "day": 15,
        "hours": 0,
        "minutes": 5,
        "seconds": 48,
        "nanoseconds": 951386624,
        "lat": 58.656,
        "lon": 17.2419,
        "peakCurrent": -6,
        "cloudIndicator": 1,
    }
    base.update(over)
    return base


def test_parse_day_builds_utc_timestamp_ms():
    obs = parse_day({"values": [_record()]})
    assert len(obs) == 1
    s = obs[0]
    # 2024-07-15 00:05:48 UTC = 1721002748000 ms, + 951ms from nanoseconds
    assert s.ts_utc == 1721002748000 + 951
    assert s.lat == 58.656
    assert s.lon == 17.2419
    assert s.peak_current == -6.0
    assert s.cloud_indicator == 1


def test_parse_day_skips_records_without_coords():
    obs = parse_day({"values": [_record(lat=None), _record()]})
    assert len(obs) == 1


def test_parse_day_empty_payload():
    assert parse_day({}) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_lightning_parse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.lightning_parse'`

- [ ] **Step 3: Implement** — create `backend/app/services/lightning_parse.py`:

```python
"""Parse a SMHI lightning day file (data.json) into StrikeRaw objects.

The day file is `{"values": [ {year, month, day, hours, minutes, seconds,
nanoseconds, lat, lon, peakCurrent, cloudIndicator, ...}, ... ]}` in UTC."""

from datetime import datetime, timezone

from app.dto import StrikeRaw


def _ts_ms(r: dict) -> int:
    dt = datetime(
        r["year"],
        r["month"],
        r["day"],
        r["hours"],
        r["minutes"],
        r["seconds"],
        tzinfo=timezone.utc,
    )
    return int(dt.timestamp() * 1000) + int(r.get("nanoseconds", 0)) // 1_000_000


def parse_day(payload: dict) -> list[StrikeRaw]:
    out: list[StrikeRaw] = []
    for r in payload.get("values") or []:
        lat = r.get("lat")
        lon = r.get("lon")
        if lat is None or lon is None:
            continue
        out.append(
            StrikeRaw(
                ts_utc=_ts_ms(r),
                lat=float(lat),
                lon=float(lon),
                peak_current=float(r.get("peakCurrent", 0)),
                cloud_indicator=int(r.get("cloudIndicator", 0)),
            )
        )
    return out
```

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/test_lightning_parse.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lightning_parse.py backend/tests/test_lightning_parse.py
git commit -m "feat(backend): parse SMHI lightning day files"
```

---

### Task 5: Lightning client

**Files:**
- Create: `backend/app/services/lightning_client.py`
- Test: `backend/tests/test_lightning_client.py`

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_lightning_client.py`:

```python
import httpx

from app.services.lightning_client import LightningClient


def _client_with(handler) -> LightningClient:
    transport = httpx.MockTransport(handler)
    return LightningClient(base_url="https://example.test/api/version/latest", transport=transport)


def test_fetch_day_hits_day_url():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/year/2024/month/7/day/15/data.json")
        return httpx.Response(200, json={"values": [{"lat": 1.0}]})

    payload = _client_with(handler).fetch_day(2024, 7, 15)
    assert payload["values"][0]["lat"] == 1.0


def test_fetch_day_404_returns_empty():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    assert _client_with(handler).fetch_day(1999, 1, 1) == {}


def test_fetch_day_other_error_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    try:
        _client_with(handler).fetch_day(2024, 7, 15)
        raise AssertionError("expected HTTPStatusError")
    except httpx.HTTPStatusError:
        pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_lightning_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.lightning_client'`

- [ ] **Step 3: Implement** — create `backend/app/services/lightning_client.py`:

```python
"""SMHI Open Data lightning client. The archive is per-day national files."""

import httpx

_THREAD_TIMEOUT = 30.0


class LightningClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = _THREAD_TIMEOUT,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self._client = httpx.Client(base_url=base_url, timeout=timeout, transport=transport)

    def fetch_day(self, year: int, month: int, day: int) -> dict:
        """Return the day's payload dict ({"values": [...]}). A 404 means no
        data for that day and yields {} (not an error)."""
        r = self._client.get(f"/year/{year}/month/{month}/day/{day}/data.json")
        if r.status_code == 404:
            return {}
        r.raise_for_status()
        return r.json()
```

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/test_lightning_client.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/lightning_client.py backend/tests/test_lightning_client.py
git commit -m "feat(backend): SMHI lightning day-file client"
```

---

### Task 6: Lightning schemas + count aggregator

**Files:**
- Create: `backend/app/schemas/lightning.py`, `backend/app/services/lightning_aggregate.py`
- Test: `backend/tests/test_lightning_aggregate.py`

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_lightning_aggregate.py`:

```python
from app.dto import StrikeRaw
from app.services.lightning_aggregate import aggregate_counts


def _strike(ts: int) -> StrikeRaw:
    return StrikeRaw(ts_utc=ts, lat=59.0, lon=18.0, peak_current=-5.0, cloud_indicator=0)


# three strikes on 2024-07-15, two within the same hour; one on 2024-07-16
H = 3600_000
DAY15 = 1721001600000  # 2024-07-15 00:00 UTC
DAY16 = 1721088000000  # 2024-07-16 00:00 UTC


def test_counts_per_day():
    strikes = [_strike(DAY15 + H), _strike(DAY15 + 2 * H), _strike(DAY16 + H)]
    points = aggregate_counts(strikes, "daily")
    assert [(p.ts, p.count) for p in points] == [(DAY15, 2), (DAY16, 1)]


def test_counts_per_hour():
    strikes = [_strike(DAY15 + H + 60_000), _strike(DAY15 + H + 120_000)]
    points = aggregate_counts(strikes, "hourly")
    assert [(p.ts, p.count) for p in points] == [(DAY15 + H, 2)]


def test_empty():
    assert aggregate_counts([], "monthly") == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_lightning_aggregate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.lightning_aggregate'`

- [ ] **Step 3: Create the schemas** — `backend/app/schemas/lightning.py`:

```python
from pydantic import BaseModel


class LightningPoint(BaseModel):
    ts: int  # epoch ms, UTC (bucket start)
    count: int  # strikes in the bucket within the radius


class LightningCenter(BaseModel):
    lat: float
    lon: float


class LightningResponse(BaseModel):
    center: LightningCenter
    radius_km: float
    resolution: str
    unit: str = "strikes"
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[LightningPoint]
```

- [ ] **Step 4: Implement the aggregator** — `backend/app/services/lightning_aggregate.py`:

```python
"""Bucket lightning strikes into hourly/daily/monthly counts (UTC)."""

from app.dto import StrikeRaw
from app.schemas.lightning import LightningPoint
from app.services.timebuckets import day_key, hour_key, month_key

_KEYS = {"hourly": hour_key, "daily": day_key, "monthly": month_key}


def aggregate_counts(strikes: list[StrikeRaw], resolution: str) -> list[LightningPoint]:
    key_fn = _KEYS[resolution]
    counts: dict[int, int] = {}
    for s in strikes:
        k = key_fn(s.ts_utc)
        counts[k] = counts.get(k, 0) + 1
    return [LightningPoint(ts=k, count=counts[k]) for k in sorted(counts)]
```

- [ ] **Step 5: Run tests**

Run: `cd backend && uv run pytest tests/test_lightning_aggregate.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/lightning.py backend/app/services/lightning_aggregate.py backend/tests/test_lightning_aggregate.py
git commit -m "feat(backend): lightning schemas + count aggregation"
```

---

### Task 7: Lightning repository

**Files:**
- Create: `backend/app/repositories/lightning_base.py`, `backend/app/repositories/lightning_sqlite.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_lightning_repository.py`

- [ ] **Step 1: Add a fixture** — in `backend/tests/conftest.py`, add at the end:

```python
@pytest.fixture
def lrepo(engine):
    from app.repositories.lightning_sqlite import SqliteLightningRepository

    return SqliteLightningRepository(engine)
```

- [ ] **Step 2: Write the failing test** — create `backend/tests/test_lightning_repository.py`:

```python
from app.dto import StrikeRaw


def _s(ts, lat, lon):
    return StrikeRaw(ts_utc=ts, lat=lat, lon=lon, peak_current=-5.0, cloud_indicator=0)


def test_upsert_is_idempotent(lrepo):
    lrepo.upsert_strikes([_s(1000, 59.0, 18.0)])
    lrepo.upsert_strikes([_s(1000, 59.0, 18.0)])  # same ts/lat/lon -> no dup
    rows = lrepo.strikes_in_bbox(0.0, 90.0, 0.0, 90.0, 0, 2000)
    assert len(rows) == 1


def test_bbox_and_time_filter(lrepo):
    lrepo.upsert_strikes(
        [
            _s(1000, 59.0, 18.0),  # in box + time
            _s(1000, 10.0, 18.0),  # outside lat box
            _s(9999, 59.0, 18.0),  # outside time
        ]
    )
    rows = lrepo.strikes_in_bbox(58.0, 60.0, 17.0, 19.0, 0, 2000)
    assert len(rows) == 1
    assert rows[0].lat == 59.0


def test_day_ledger_record_and_get(lrepo):
    assert lrepo.get_day(86400000) is None
    lrepo.record_day(86400000, fetched_at=100, count=5)
    log = lrepo.get_day(86400000)
    assert log.count == 5 and log.fetched_at == 100
    lrepo.record_day(86400000, fetched_at=200, count=7)  # upsert in place
    log2 = lrepo.get_day(86400000)
    assert log2.count == 7 and log2.fetched_at == 200
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_lightning_repository.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.repositories.lightning_sqlite'`

- [ ] **Step 4: Create the ABC** — `backend/app/repositories/lightning_base.py`:

```python
"""Storage-agnostic interface for cached lightning strikes."""

from abc import ABC, abstractmethod

from app.dto import StrikeRaw
from app.models import LightningDay


class LightningRepository(ABC):
    @abstractmethod
    def upsert_strikes(self, strikes: list[StrikeRaw]) -> None: ...

    @abstractmethod
    def get_day(self, day_start_ms: int) -> LightningDay | None: ...

    @abstractmethod
    def record_day(self, day_start_ms: int, fetched_at: int, count: int) -> None: ...

    @abstractmethod
    def strikes_in_bbox(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        start_ts: int,
        end_ts: int,
    ) -> list[StrikeRaw]: ...
```

- [ ] **Step 5: Implement the SQLite repo** — `backend/app/repositories/lightning_sqlite.py`:

```python
"""SQLite-backed LightningRepository using SQLModel."""

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.dto import StrikeRaw
from app.models import LightningDay, LightningStrike
from app.repositories.lightning_base import LightningRepository


class SqliteLightningRepository(LightningRepository):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_strikes(self, strikes: list[StrikeRaw]) -> None:
        if not strikes:
            return
        rows = [
            {
                "ts_utc": s.ts_utc,
                "lat": s.lat,
                "lon": s.lon,
                "peak_current": s.peak_current,
                "cloud_indicator": s.cloud_indicator,
            }
            for s in strikes
        ]
        stmt = sqlite_insert(LightningStrike).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["ts_utc", "lat", "lon"],
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def get_day(self, day_start_ms: int) -> LightningDay | None:
        with Session(self._engine) as s:
            return s.get(LightningDay, day_start_ms)

    def record_day(self, day_start_ms: int, fetched_at: int, count: int) -> None:
        stmt = sqlite_insert(LightningDay).values(
            day_start_ms=day_start_ms, fetched_at=fetched_at, count=count
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["day_start_ms"],
            set_={"fetched_at": stmt.excluded.fetched_at, "count": stmt.excluded.count},
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def strikes_in_bbox(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        start_ts: int,
        end_ts: int,
    ) -> list[StrikeRaw]:
        with Session(self._engine) as s:
            rows = s.exec(
                select(LightningStrike).where(
                    LightningStrike.ts_utc >= start_ts,
                    LightningStrike.ts_utc <= end_ts,
                    LightningStrike.lat >= min_lat,
                    LightningStrike.lat <= max_lat,
                    LightningStrike.lon >= min_lon,
                    LightningStrike.lon <= max_lon,
                )
            ).all()
        return [
            StrikeRaw(
                ts_utc=r.ts_utc,
                lat=r.lat,
                lon=r.lon,
                peak_current=r.peak_current,
                cloud_indicator=r.cloud_indicator,
            )
            for r in rows
        ]
```

- [ ] **Step 6: Run tests**

Run: `cd backend && uv run pytest tests/test_lightning_repository.py -q`
Expected: PASS. Then `cd backend && uv run ruff check app tests` → clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/repositories/lightning_base.py backend/app/repositories/lightning_sqlite.py backend/tests/conftest.py backend/tests/test_lightning_repository.py
git commit -m "feat(backend): lightning repository (strikes + day ledger)"
```

---

### Task 8: Lightning service

**Files:**
- Create: `backend/app/services/lightning.py`
- Test: `backend/tests/test_lightning_service.py`

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_lightning_service.py`:

```python
import httpx
import pytest

from app.core.config import settings
from app.services.lightning import LightningService, LightningUnavailable

NOW = 1_700_000_000_000  # fixed "now" in ms


def _raw(ts_ms, lat, lon):
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
        "cloudIndicator": 0,
    }


class FakeClient:
    def __init__(self):
        self.calls = 0
        self.fail = False
        # strikes keyed by (year, month, day)
        self.days: dict[tuple, list] = {}

    def fetch_day(self, year, month, day):
        self.calls += 1
        if self.fail:
            raise httpx.ConnectError("boom")
        return {"values": self.days.get((year, month, day), [])}


def _service(lrepo, client):
    return LightningService(client, lrepo, settings)


def test_counts_strikes_within_radius(lrepo):
    client = FakeClient()
    # one strike ~ at the point, one ~300km away (outside 50km), same day
    near = _raw(NOW - 3600_000, 59.30, 18.07)
    far = _raw(NOW - 3600_000, 62.00, 18.07)
    from datetime import datetime, timezone

    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [near, far]

    svc = _service(lrepo, client)
    resp = svc.get_lightning(59.30, 18.07, "daily", now_ms=NOW)
    assert resp.unit == "strikes"
    assert resp.radius_km == settings.lightning_radius_km
    assert sum(p.count for p in resp.points) == 1  # only the near strike


def test_second_call_does_not_refetch_final_days(lrepo):
    client = FakeClient()
    svc = _service(lrepo, client)
    svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)
    first = client.calls
    svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)
    # within TTL, no day is re-fetched
    assert client.calls == first


def test_cold_and_unavailable_raises(lrepo):
    client = FakeClient()
    client.fail = True
    svc = _service(lrepo, client)
    with pytest.raises(LightningUnavailable):
        svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_lightning_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.lightning'`

- [ ] **Step 3: Implement** — create `backend/app/services/lightning.py`:

```python
"""Orchestrates lightning fetching, caching, and aggregation.

Day-files are national and immutable for past days, so each is fetched once and
reused for every location. Missing days are fetched concurrently (network only);
all DB writes happen on the calling thread to avoid SQLite write contention."""

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from math import cos, radians
from threading import Lock

import httpx

from app.repositories.lightning_base import LightningRepository
from app.schemas.lightning import LightningCenter, LightningResponse
from app.services.geo import haversine_km
from app.services.lightning_aggregate import aggregate_counts
from app.services.lightning_client import LightningClient
from app.services.lightning_parse import parse_day
from app.services.timebuckets import day_key

_DAY_MS = 24 * 3600 * 1000
_MONTH_MS = 30 * _DAY_MS
_KM_PER_DEG_LAT = 111.0


class LightningUnavailable(Exception):
    """SMHI could not be reached and no cached strikes exist."""


class LightningService:
    def __init__(
        self,
        client: LightningClient,
        repo: LightningRepository,
        settings,
    ) -> None:
        self.client = client
        self.repo = repo
        self.radius_km = settings.lightning_radius_km
        self.history_ms = settings.lightning_history_months * _MONTH_MS
        self.recent_ttl_ms = settings.lightning_recent_ttl_seconds * 1000
        self.workers = settings.lightning_fetch_workers
        self._lock = Lock()

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def _day_starts(self, start_ms: int, now_ms: int) -> list[int]:
        first = day_key(start_ms)
        last = day_key(now_ms)
        return list(range(first, last + _DAY_MS, _DAY_MS))

    def _fetch_day(self, day_start_ms: int):
        """Network + parse only (runs in worker threads). Returns
        (day_start_ms, strikes, ok)."""
        dt = datetime.fromtimestamp(day_start_ms / 1000, tz=timezone.utc)
        try:
            payload = self.client.fetch_day(dt.year, dt.month, dt.day)
        except httpx.HTTPError:
            return (day_start_ms, [], False)
        return (day_start_ms, parse_day(payload), True)

    def ensure_days(self, day_starts: list[int], now_ms: int) -> bool:
        """Fetch any missing/stale days. Returns True if some fetch failed
        (stale). DB writes happen here on the calling thread."""
        today = day_key(now_ms)
        final_before = today - _DAY_MS  # today and yesterday are non-final
        to_fetch: list[int] = []
        for ds in day_starts:
            log = self.repo.get_day(ds)
            if log is None:
                to_fetch.append(ds)
            elif ds >= final_before and now_ms - log.fetched_at > self.recent_ttl_ms:
                to_fetch.append(ds)
        if not to_fetch:
            return False

        results = []
        with ThreadPoolExecutor(max_workers=self.workers) as ex:
            results = list(ex.map(self._fetch_day, to_fetch))

        stale = False
        for ds, strikes, ok in results:
            if ok:
                self.repo.upsert_strikes(strikes)
                self.repo.record_day(ds, now_ms, len(strikes))
            else:
                stale = True
        return stale

    def get_lightning(
        self,
        lat: float,
        lon: float,
        resolution: str,
        now_ms: int | None = None,
    ) -> LightningResponse:
        now_ms = now_ms if now_ms is not None else self._now_ms()
        start_ms = now_ms - self.history_ms
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
        if not within and stale and self.repo.get_day(day_key(now_ms)) is None:
            raise LightningUnavailable("SMHI lightning is unavailable and nothing is cached.")

        return LightningResponse(
            center=LightningCenter(lat=lat, lon=lon),
            radius_km=self.radius_km,
            resolution=resolution,
            stale=stale,
            points=aggregate_counts(within, resolution),
        )
```

Note on the cold-and-unavailable check: when every fetch fails, no `LightningDay`
row is written, so `get_day(today)` is `None` and `within` is empty → raises.
Once any day is cached, later outages serve cached data with `stale=True`.

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/test_lightning_service.py -q`
Expected: PASS

- [ ] **Step 5: Run full suite + lint**

Run: `cd backend && uv run pytest -q && uv run ruff check app tests`
Expected: all PASS, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/lightning.py backend/tests/test_lightning_service.py
git commit -m "feat(backend): lightning service (lazy concurrent fetch, radius filter)"
```

---

### Task 9: Lightning endpoint

**Files:**
- Modify: `backend/app/api/routes.py`
- Test: `backend/tests/test_lightning_endpoint.py`

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_lightning_endpoint.py`:

```python
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


class FakeClient:
    def __init__(self):
        self.fail = False

    def fetch_day(self, year, month, day):
        if self.fail:
            raise httpx.ConnectError("boom")
        return {"values": []}


def _make_service(fake):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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


def test_lightning_ok_empty():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning", params={"lat": 59.3, "lon": 18.1})
    assert r.status_code == 200
    body = r.json()
    assert body["unit"] == "strikes"
    assert body["radius_km"] == settings.lightning_radius_km
    assert body["points"] == []


def test_lightning_invalid_resolution_422():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning", params={"lat": 59.3, "lon": 18.1, "resolution": "weekly"})
    assert r.status_code == 422


def test_lightning_503_when_unavailable_and_cold():
    fake = FakeClient()
    fake.fail = True
    client = _client_with(_make_service(fake))
    r = client.get("/api/lightning", params={"lat": 59.3, "lon": 18.1})
    assert r.status_code == 503
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_lightning_endpoint.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_lightning_service'`

- [ ] **Step 3: Wire the endpoint** — in `backend/app/api/routes.py`, add these imports near the existing ones:

```python
from app.repositories.lightning_sqlite import SqliteLightningRepository
from app.schemas.lightning import LightningResponse
from app.services.lightning import LightningService, LightningUnavailable
from app.services.lightning_client import LightningClient
```

Then add the service builder after `get_cloud_cover_service`:

```python
@lru_cache(maxsize=1)
def get_lightning_service() -> LightningService:
    """Lazily build a process-wide LightningService. Overridable in tests."""

    client = LightningClient(base_url=settings.lightning_base_url)
    return LightningService(client, SqliteLightningRepository(engine), settings)
```

And add the route after `cloud_cover`:

```python
@router.get(
    "/api/lightning",
    response_model=LightningResponse,
    tags=["lightning"],
)
def lightning(
    lat: float,
    lon: float,
    resolution: Literal["hourly", "daily", "monthly"] = "daily",
    service: LightningService = Depends(get_lightning_service),
) -> LightningResponse:
    try:
        return service.get_lightning(lat, lon, resolution)
    except LightningUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
```

- [ ] **Step 4: Run the full suite + lint**

Run: `cd backend && uv run pytest -q && uv run ruff check app tests`
Expected: all PASS, ruff clean.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes.py backend/tests/test_lightning_endpoint.py
git commit -m "feat(backend): /api/lightning endpoint"
```

---

### Task 10: Cache warm-up script + Make target

**Files:**
- Create: `backend/scripts/ingest_lightning.py`
- Modify: `Makefile`

- [ ] **Step 1: Create the script** — `backend/scripts/ingest_lightning.py`:

```python
"""Warm the lightning cache by ensuring all day-files in the retained window are
fetched. Run via `make ingest-lightning`. Safe to re-run (idempotent)."""

import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from app.core.config import settings  # noqa: E402
from app.db.session import engine, init_db  # noqa: E402
from app.repositories.lightning_sqlite import SqliteLightningRepository  # noqa: E402
from app.services.lightning import LightningService  # noqa: E402
from app.services.lightning_client import LightningClient  # noqa: E402


def main() -> None:
    init_db()
    svc = LightningService(
        LightningClient(base_url=settings.lightning_base_url),
        SqliteLightningRepository(engine),
        settings,
    )
    # Any coordinate warms every day (ensure_days is location-independent).
    resp = svc.get_lightning(62.0, 15.0, "monthly")
    print(f"Lightning cache warmed. stale={resp.stale}, buckets={len(resp.points)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add the Make target** — in `Makefile`, add `ingest-lightning` to the `.PHONY` line, and add this target after `reset-db`:

```make
# Warm the lightning cache (fetches up to ~12 months of national day-files).
ingest-lightning:
	$(COMPOSE) exec -T backend uv run python scripts/ingest_lightning.py
```

- [ ] **Step 3: Verify the target parses**

Run: `make -n ingest-lightning`
Expected: prints the `docker compose ... uv run python scripts/ingest_lightning.py` command.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/ingest_lightning.py Makefile
git commit -m "chore(backend): add lightning cache warm-up script + make target"
```

---

### Task 11: Frontend — API client, shared label, lightning chart

**Files:**
- Create: `frontend/src/lib/chart-format.ts`, `frontend/src/components/LightningChart.tsx`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/api-schema.d.ts` (generated), `frontend/src/components/CloudCoverChart.tsx`, `backend/openapi.json` (generated)

- [ ] **Step 1: Regenerate the OpenAPI schema + types**

Run from the repo root (stack not required — the export script runs locally):
```bash
cd backend && uv run python scripts/export_openapi.py && cd ../frontend && npm run gen:types
```
Expected: `backend/openapi.json` includes `/api/lightning`; `frontend/src/lib/api-schema.d.ts` gains that path.

- [ ] **Step 2: Extract the shared time-label formatter** — create `frontend/src/lib/chart-format.ts`:

```typescript
import type { Resolution } from "./api";

// UTC time-axis label for a bucket timestamp, scaled to the resolution.
export function formatLabel(tsMs: number, resolution: Resolution): string {
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
```

- [ ] **Step 3: Use the shared formatter in the cloud chart** — in `frontend/src/components/CloudCoverChart.tsx`, delete the local `formatLabel` function (the `function formatLabel(...) { ... }` block) and add to the imports at the top:

```typescript
import { formatLabel } from "../lib/chart-format";
```

- [ ] **Step 4: Add the API helper** — in `frontend/src/lib/api.ts`, append:

```typescript
export type Lightning =
  paths["/api/lightning"]["get"]["responses"]["200"]["content"]["application/json"];

export async function getLightning(
  lat: number,
  lon: number,
  resolution: Resolution,
): Promise<Lightning> {
  const { data, error, response } = await client.GET("/api/lightning", {
    params: { query: { lat, lon, resolution } },
  });
  if (data) return data;
  if (response.status === 503) {
    throw new Error("SMHI lightning is unavailable and no data is cached yet.");
  }
  throw new Error(error ? JSON.stringify(error) : "lightning request failed");
}
```

- [ ] **Step 5: Create the lightning bar chart** — `frontend/src/components/LightningChart.tsx`:

```tsx
import { useMemo } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

import type { Lightning, Resolution } from "../lib/api";
import { formatLabel } from "../lib/chart-format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type Props = {
  data: Lightning;
  resolution: Resolution;
  color: string;
};

export function LightningChart({ data, resolution, color }: Props) {
  const chartData = useMemo(
    () => ({
      labels: data.points.map((p) => formatLabel(p.ts, resolution)),
      datasets: [
        {
          label: "Lightning strikes",
          data: data.points.map((p) => p.count),
          backgroundColor: color,
        },
      ],
    }),
    [data, resolution, color],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          title: { display: true, text: "Strikes" },
          ticks: { precision: 0 },
        },
        x: { ticks: { maxTicksLimit: 8, autoSkip: true } },
      },
      plugins: { legend: { display: false } },
    }),
    [],
  );

  return <Bar data={chartData} options={options} />;
}
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: PASS (cloud chart still compiles using the shared `formatLabel`; lightning chart compiles). Pre-existing >500 kB chunk warning is fine.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/chart-format.ts frontend/src/lib/api.ts frontend/src/lib/api-schema.d.ts frontend/src/components/CloudCoverChart.tsx frontend/src/components/LightningChart.tsx backend/openapi.json
git commit -m "feat(frontend): lightning API client + bar chart + shared label formatter"
```

---

### Task 12: Frontend — wire lightning into the app

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add imports** — in `frontend/src/App.tsx`, add to the imports:

```typescript
import { LightningChart } from "./components/LightningChart";
import { getCloudCover, getHealth, getLightning } from "./lib/api";
import type {
  CloudCover,
  CloudParam,
  Lightning,
  Resolution,
} from "./lib/api";
```

(Replace the existing `getCloudCover, getHealth` and the existing cloud type-import lines accordingly; keep the other imports.)

- [ ] **Step 2: Add lightning state** — after the `const [results, setResults] = ...` line, add:

```typescript
  const [lightning, setLightning] = useState<{
    data: Lightning | null;
    error: string | null;
  }>({ data: null, error: null });
```

- [ ] **Step 3: Clear lightning alongside results** — in `handleSelect`, `changeResolution`, and `handleClear`, after each `setResults({})` call, add:

```typescript
    setLightning({ data: null, error: null });
```

- [ ] **Step 4: Fetch lightning in the data effect** — inside the existing `useEffect(() => { if (!selection) return; ... }, [selection, resolution])`, add a lightning fetch alongside the cloud `Promise.all`. Replace the body's `Promise.all(...)...` chain with:

```typescript
    Promise.all([
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
      ),
      getLightning(selection.lat, selection.lon, resolution).then(
        (data) => ({ data, error: null }),
        (e: unknown) => ({
          data: null,
          error: e instanceof Error ? e.message : "failed",
        }),
      ),
    ])
      .then(([cloudEntries, lightningResult]) => {
        if (cancelled) return;
        setResults(Object.fromEntries(cloudEntries));
        setLightning(lightningResult);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
```

- [ ] **Step 5: Include lightning in the period window + filter its points** — replace the `latestTs` reducer and add a filtered lightning value. Change the existing `latestTs` block to also fold in lightning's last point:

```typescript
  const lightningPts = lightning.data?.points ?? [];
  const latestTs = PARAMS.reduce((max, p) => {
    const pts = results[p.id]?.data?.points;
    const last = pts && pts.length ? pts[pts.length - 1].ts : 0;
    return last > max ? last : max;
  }, lightningPts.length ? lightningPts[lightningPts.length - 1].ts : 0);
```

Then, after the existing `cutoff` line, add:

```typescript
  const lightningInWindow = lightningPts.filter((p) => p.ts >= cutoff);
```

- [ ] **Step 6: Render the lightning chart** — in the JSX, immediately after the closing `</div>` of the cloud chart container (the `<div className="relative mx-auto aspect-[2/1] ...">` block) and before the `{attribution && ...}` line, insert:

```tsx
            <div className="mt-2">
              <h3 className="mb-1 text-xs font-semibold opacity-70">
                Lightning — strikes within{" "}
                {lightning.data?.radius_km ?? 50} km
              </h3>
              <div className="relative mx-auto aspect-[3/1] w-full max-w-[600px]">
                {!loading && lightningInWindow.length > 0 && lightning.data && (
                  <LightningChart
                    data={{ ...lightning.data, points: lightningInWindow }}
                    resolution={resolution}
                    color="oklch(57% 0.21 27)"
                  />
                )}
                {!loading && lightningInWindow.length === 0 && (
                  <p className="text-sm opacity-70">
                    No lightning recorded in this period.
                  </p>
                )}
              </div>
            </div>
```

- [ ] **Step 7: Typecheck + lint + build**

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): show lightning bar chart below cloud chart"
```

---

### Task 13: Update planning docs

**Files:**
- Modify: `ai-docs/PLANNING.md`

- [ ] **Step 1: Mark the milestone** — in `ai-docs/PLANNING.md`, find the "Lightning-strike probability" milestone bullet and update it to note lightning strike counts are now fetched/cached/charted (SMHI lightning archive, fixed-radius counts, dual with cloud cover), referencing `docs/superpowers/plans/2026-06-01-smhi-lightning.md`. Add a one-line note to the Data Flow section that `/api/lightning?lat&lon&resolution` returns strike counts within a fixed radius. Update the `_Last updated_` line at the bottom to today with a short note. Match the existing style.

- [ ] **Step 2: Commit**

```bash
git add ai-docs/PLANNING.md
git commit -m "docs: note lightning feature in planning"
```

---

## Final verification

- [ ] **Backend:** `cd backend && uv run pytest -q && uv run ruff check app tests` — all green.
- [ ] **Frontend:** `cd frontend && npm run typecheck && npm run lint && npm run build` — all green.
- [ ] **Manual smoke (optional):** `make reset-db` then `make up`; optionally `make ingest-lightning` to warm the cache; pick a Swedish summer location and confirm the lightning bar chart renders below the cloud chart, that resolution/period controls drive both, and that clearing the selection hides both.
