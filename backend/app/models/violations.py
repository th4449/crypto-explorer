from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel

from .base import EntityBase, EntityResponse, VerificationTier, SourceEntry


class ViolationType(str, Enum):
    sanction = "sanction"
    seizure = "seizure"
    criminal_case = "criminal_case"
    regulatory_action = "regulatory_action"


class ViolationCreate(EntityBase):
    violation_type: ViolationType
    issuing_authority: str | None = None
    violation_date: date | None = None
    description: str | None = None
    targets: list[UUID] | None = None


class ViolationUpdate(BaseModel):
    violation_type: ViolationType | None = None
    issuing_authority: str | None = None
    violation_date: date | None = None
    description: str | None = None
    targets: list[UUID] | None = None
    verification_tier: VerificationTier | None = None
    sources: list[SourceEntry] | None = None


class ViolationResponse(EntityResponse):
    violation_type: str
    issuing_authority: str | None = None
    violation_date: date | None = None
    description: str | None = None
    targets: list[UUID] | None = None
