from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel

from .base import VerificationTier


class RelationshipType(str, Enum):
    OWNS = "OWNS"
    EMPLOYS = "EMPLOYS"
    CONTROLS_WALLET = "CONTROLS_WALLET"
    BANKS_WITH = "BANKS_WITH"
    TRANSACTED_WITH = "TRANSACTED_WITH"
    SUCCESSOR_OF = "SUCCESSOR_OF"
    SANCTIONED_BY = "SANCTIONED_BY"
    SUBSIDIARY_OF = "SUBSIDIARY_OF"


class RelationshipCreate(BaseModel):
    source_id: UUID
    target_id: UUID
    relationship_type: RelationshipType
    metadata: dict = {}
    verification_tier: VerificationTier = VerificationTier.unverified


class RelationshipResponse(BaseModel):
    id: UUID
    source_id: UUID
    target_id: UUID
    relationship_type: str
    metadata: dict
    verification_tier: str
    created_at: datetime
    # Optionally populated when returning grouped results
    source_name: str | None = None
    source_type: str | None = None
    target_name: str | None = None
    target_type: str | None = None


class PathNode(BaseModel):
    id: str
    name: str
    entity_type: str
    verification_tier: str


class PathEdge(BaseModel):
    relationship_type: str
    metadata: dict
    verification_tier: str


class ShortestPathResponse(BaseModel):
    found: bool
    length: int
    nodes: list[PathNode]
    edges: list[PathEdge]


class NeighborhoodResponse(BaseModel):
    center_id: str
    depth: int
    nodes: list[PathNode]
    edges: list[dict]
