import sqlite3

from app.db.session import _apply_sqlite_pragmas


def test_apply_sqlite_pragmas_sets_busy_timeout_without_wal(tmp_path):
    conn = sqlite3.connect(str(tmp_path / "t.db"))
    try:
        _apply_sqlite_pragmas(conn)
        # WAL is intentionally NOT used: it breaks on Docker bind mounts
        # (disk I/O error). A busy timeout is what handles write contention.
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() != "wal"
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 30000
    finally:
        conn.close()
