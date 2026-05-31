"""SMHI Open Data client for cloud cover (parameter 16).

Synchronous httpx client wrapping the SMHI metobs endpoints."""

import httpx

from app.dto import StationRaw

_API_VERSION = "1.0"


class SMHIClient:
    def __init__(
        self,
        base_url: str,
        param: int = 16,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self.param = param
        self._client = httpx.Client(base_url=base_url, timeout=timeout, transport=transport)

    def fetch_station_list(self) -> list[StationRaw]:
        r = self._client.get(f"/version/{_API_VERSION}/parameter/{self.param}.json")
        r.raise_for_status()
        data = r.json()
        out: list[StationRaw] = []
        for s in data.get("station", []):
            out.append(
                StationRaw(
                    id=int(s["id"]),
                    name=s.get("name", ""),
                    lat=float(s["latitude"]),
                    lon=float(s["longitude"]),
                    active=bool(s.get("active", False)),
                    from_ts=s.get("from"),
                    to_ts=s.get("to"),
                )
            )
        return out

    def fetch_recent(self, station_id: int) -> dict:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{self.param}"
            f"/station/{station_id}/period/latest-months/data.json"
        )
        r.raise_for_status()
        return r.json()

    def fetch_archive(self, station_id: int) -> str:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{self.param}"
            f"/station/{station_id}/period/corrected-archive/data.csv"
        )
        r.raise_for_status()
        return r.text
