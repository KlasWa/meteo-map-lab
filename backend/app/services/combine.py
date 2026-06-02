"""Combine per-layer cloud-amount observations into a single max-octas series.

SMHI reports octa layers cumulatively (WMO summation principle), so the maximum
value across layers 29/31/33/35 at a timestamp equals total low/mid cloud cover."""

from app.dto import ParsedObs


def merge_layers_max(series: list[list[ParsedObs]]) -> list[ParsedObs]:
    """Per-timestamp max over non-None layer values, sorted by timestamp.
    Timestamps where every layer is None or absent are omitted."""
    by_ts: dict[int, float] = {}
    for obs in series:
        for o in obs:
            if o.value is None:
                continue
            cur = by_ts.get(o.ts_utc)
            if cur is None or o.value > cur:
                by_ts[o.ts_utc] = o.value
    return [ParsedObs(ts, by_ts[ts], "G") for ts in sorted(by_ts)]
