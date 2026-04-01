from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from .base import EntityBase, EntityResponse, VerificationTier, SourceEntry


class PersonCreate(EntityBase):
    name: str
    aliases: list[str] | None = None
    nationality: str | None = None
    role_title: str | None = None
    sanctions_status: bool = False
    pep_status: bool = False
    description: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    aliases: list[str] | None = None
    nationality: str | None = None
    role_title: str | None = None
    sanctions_status: bool | None = None
    pep_status: bool | None = None
    description: str | None = None
    verification_tier: VerificationTier | None = None
    sources: list[SourceEntry] | None = None


class PersonResponse(EntityResponse):
    name: str
    aliases: list[str] | None = None
    nationality: str | None = None
    role_title: str | None = None
    sanctions_status: bool
    pep_status: bool
    description: str | None = None
