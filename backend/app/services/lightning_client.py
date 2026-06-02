"""SMHI Open Data lightning client. The archive is per-day national files."""

import httpx

_DEFAULT_TIMEOUT = 30.0


class LightningClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = _DEFAULT_TIMEOUT,
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
