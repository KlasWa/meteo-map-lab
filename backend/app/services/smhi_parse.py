"""Parsers for SMHI cloud-cover responses into ParsedObs.

Archive is semicolon-delimited CSV with several metadata header blocks before
the data rows; recent is JSON with string values. 113 = "cannot determine"
(fog/precip) and empty values both map to None."""

from datetime import datetime, timezone

from app.dto import ParsedObs

_INDETERMINATE = 113.0


def _to_ms(date_str: str, time_str: str) -> int:
    dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M:%S").replace(
        tzinfo=timezone.utc
    )
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
