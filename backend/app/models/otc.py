from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OTCExchangeCreate(BaseModel):
    company_id: UUID | None = None
    name: str
    is_active: bool = True


class OTCExchangeResponse(BaseModel):
    id: UUID
    company_id: UUID | None
    name: str
    average_rating: float
    total_reviews: int
    is_active: bool
    created_at: datetime


class ReviewSubmit(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str = Field(min_length=10, max_length=5000)


class ReviewResponse(BaseModel):
    id: UUID
    exchange_id: UUID
    rating: int
    review_text: str
    status: str
    submitted_at: datetime


class PublicReviewResponse(BaseModel):
    rating: int
    review_text: str
    submitted_at: datetime


class ModerationAction(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
    moderation_notes: str | None = None


class ModerationQueueItem(BaseModel):
    id: UUID
    exchange_id: UUID
    exchange_name: str | None = None
    rating: int
    review_text: str
    reviewer_hash: str
    status: str
    approvals: list
    moderation_notes: str | None
    submitted_at: datetime
