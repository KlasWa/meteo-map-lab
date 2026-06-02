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
    threadpool threads against one SQLite file, so writers contend for SQLite's
    single write lock. A generous busy timeout makes a blocked writer wait for
    the lock instead of failing with 'database is locked'.

    NOTE: WAL is deliberately NOT enabled. The DB is bind-mounted into the
    container (Docker Desktop's virtualized filesystem on macOS), where WAL's
    memory-mapped -shm file is unsupported and raises 'disk I/O error'. The
    rollback journal uses plain POSIX locks that work there; the busy timeout
    plus short (batched) write transactions handle the contention.
    """
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA busy_timeout=30000")  # ms
    cur.close()


@event.listens_for(engine, "connect")
def _on_connect(dbapi_conn, _record):
    _apply_sqlite_pragmas(dbapi_conn)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
