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
