"""SMHI Open Data client for cloud parameters.

Synchronous httpx client wrapping the SMHI metobs endpoints. The parameter id
is passed per call (default 16) so one client serves every cloud parameter."""

import httpx

from app.dto import StationRaw

_API_VERSION = "1.0"
_DEFAULT_PARAM = 16


class SMHIClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self._client = httpx.Client(base_url=base_url, timeout=timeout, transport=transport)

    def fetch_station_list(self, param: int = _DEFAULT_PARAM) -> list[StationRaw]:
        r = self._client.get(f"/version/{_API_VERSION}/parameter/{param}.json")
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

    def fetch_recent(self, station_id: int, param: int = _DEFAULT_PARAM) -> dict:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{param}"
            f"/station/{station_id}/period/latest-months/data.json"
        )
        r.raise_for_status()
        return r.json()

    def fetch_archive(self, station_id: int, param: int = _DEFAULT_PARAM) -> str:
        r = self._client.get(
            f"/version/{_API_VERSION}/parameter/{param}"
            f"/station/{station_id}/period/corrected-archive/data.csv"
        )
        r.raise_for_status()
        return r.text
