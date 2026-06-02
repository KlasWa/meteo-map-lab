from collections.abc import Iterator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

import app.models  # noqa: F401  (registers tables on SQLModel.metadata)
from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
)


def _apply_sqlite_pragmas(dbapi_conn) -> None:
    """Configure each SQLite connection for concurrent access.

    Cloud (param 16 + 29) and lightning requests run in parallel FastAPI
    threadpool threads against one SQLite file. WAL lets readers proceed while a
    single writer works, and a generous busy timeout makes a blocked writer wait
    for the lock instead of failing with 'database is locked'. synchronous=NORMAL
    is the safe, faster pairing with WAL.
    """
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=30000")  # ms
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


@event.listens_for(engine, "connect")
def _on_connect(dbapi_conn, _record):
    _apply_sqlite_pragmas(dbapi_conn)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
