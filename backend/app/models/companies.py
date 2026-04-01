from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel

from .base import EntityBase, EntityResponse, VerificationTier, SourceEntry


class CompanySubtype(str, Enum):
    exchange = "exchange"
    processor = "processor"
    issuer = "issuer"
    shell = "shell"


class CompanyCreate(EntityBase):
    name: str
    jurisdiction: str | None = None
    registration_id: str | None = None
    entity_subtype: CompanySubtype | None = None
    status: str | None = None
    website: str | None = None
    telegram_handle: str | None = None
    description: str | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    jurisdiction: str | None = None
    registration_id: str | None = None
    entity_subtype: CompanySubtype | None = None
    status: str | None = None
    website: str | None = None
    telegram_handle: str | None = None
    description: str | None = None
    verification_tier: VerificationTier | None = None
    sources: list[SourceEntry] | None = None


class CompanyResponse(EntityResponse):
    name: str
    jurisdiction: str | None = None
    registration_id: str | None = None
    entity_subtype: str | None = None
    status: str | None = None
    website: str | None = None
    telegram_handle: str | None = None
    description: str | None = None
