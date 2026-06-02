from pydantic import BaseModel


class PurgeResponse(BaseModel):
    scope: str
    deleted: dict[str, int]
