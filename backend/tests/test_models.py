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
