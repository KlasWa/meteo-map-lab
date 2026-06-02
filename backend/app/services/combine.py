"""Combine per-layer cloud-amount observations into a single max-octas series.

SMHI reports octa layers cumulatively (WMO summation principle), so the maximum
value across layers 29/31/33/35 at a timestamp equals total low/mid cloud cover."""

from app.dto import ParsedObs


def merge_layers_max(series: list[list[ParsedObs]]) -> list[ParsedObs]:
    """Return one series with, per timestamp, the max non-None value across layers.

    The quality of the winning (max-value) observation is preserved. Timestamps
    where every layer is None or absent are omitted. Ties keep the first-seen
    observation. Result is sorted ascending by timestamp."""
    by_ts: dict[int, tuple[float, str]] = {}
    for obs in series:
        for o in obs:
            if o.value is None:
                continue
            cur = by_ts.get(o.ts_utc)
            if cur is None or o.value > cur[0]:
                by_ts[o.ts_utc] = (o.value, o.quality)
    return [ParsedObs(ts, by_ts[ts][0], by_ts[ts][1]) for ts in sorted(by_ts)]
