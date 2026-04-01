from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from .base import EntityBase, EntityResponse, VerificationTier, SourceEntry


class WalletCreate(EntityBase):
    address: str
    blockchain: str
    label: str | None = None
    attributed_to: UUID | None = None
    cluster_id: str | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    total_volume: float | None = None


class WalletUpdate(BaseModel):
    address: str | None = None
    blockchain: str | None = None
    label: str | None = None
    attributed_to: UUID | None = None
    cluster_id: str | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    total_volume: float | None = None
    verification_tier: VerificationTier | None = None
    sources: list[SourceEntry] | None = None


class WalletResponse(EntityResponse):
    address: str
    blockchain: str
    label: str | None = None
    attributed_to: UUID | None = None
    cluster_id: str | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    total_volume: float | None = None
