from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from .base import EntityBase, EntityResponse, VerificationTier, SourceEntry


class BankCreate(EntityBase):
    name: str
    swift_code: str | None = None
    jurisdiction: str | None = None
    sanctions_status: bool = False
    role: str | None = None
    description: str | None = None


class BankUpdate(BaseModel):
    name: str | None = None
    swift_code: str | None = None
    jurisdiction: str | None = None
    sanctions_status: bool | None = None
    role: str | None = None
    description: str | None = None
    verification_tier: VerificationTier | None = None
    sources: list[SourceEntry] | None = None


class BankResponse(EntityResponse):
    name: str
    swift_code: str | None = None
    jurisdiction: str | None = None
    sanctions_status: bool
    role: str | None = None
    description: str | None = None
