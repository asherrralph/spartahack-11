from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class ListenerHealth(BaseModel):
    status: str
    uptime_seconds: Optional[float] = None


class ListenerPairStats(BaseModel):
    pair: str
    bot_activity_score: Optional[float] = None
    transactions_5min: Optional[int] = None
    sandwiches_5min: Optional[int] = None
    avg_gas_gwei: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ListenerPairsResponse(BaseModel):
    count: int
    pairs: List[Dict[str, Any]]


class Role1TestResponse(BaseModel):
    success: bool
    role1_health: Optional[Dict[str, Any]] = None
    message: Optional[str] = None
    error: Optional[str] = None
    listener_url: Optional[str] = None
    suggestion: Optional[str] = None


class SlippageResponse(BaseModel):
    pair: str
    recommended_slippage: float
    recommended_percent: str
    risk_level: str
    message: str
    role1_snapshot: Optional[Dict[str, Any]] = None
