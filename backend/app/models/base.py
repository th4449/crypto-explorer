from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class VerificationTier(str, Enum):
    verified = "verified"
    probable = "probable"
    unverified = "unverified"


class SourceEntry(BaseModel):
    title: str
    url: str
    date_accessed: str | None = None


class EntityBase(BaseModel):
    verification_tier: VerificationTier = VerificationTier.unverified
    sources: list[SourceEntry] = Field(default_factory=list)


class EntityResponse(BaseModel):
    id: UUID
    verification_tier: VerificationTier
    sources: list[SourceEntry]
    created_at: datetime
    updated_at: datetime


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    per_page: int
    pages: int
