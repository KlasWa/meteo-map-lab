from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

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
        s.add(Observation(station_id=1, ts_utc=1000, value=50.0, quality="G"))
        s.commit()
        # Composite PK is (param, id); param defaults to 16.
        assert s.get(Station, (16, 1)).name == "Test A"


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
