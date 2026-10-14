from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class MiningTelemetryEvent(BaseModel):
    event: str
    timestamp: str
    total_papers: int
    total_execution_seconds: float
    workers: Dict[str, Any]
    phase: str
    progress: float
    elapsed: float
    eta_seconds: Optional[float] = None
    run_id: Optional[str] = None


class MiningManifestResponse(BaseModel):
    status: str = "STANDBY"
    total_papers: int = 10000
    run_id: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    pillars: Dict[str, Any] = Field(default_factory=dict)
    artifacts: Dict[str, Any] = Field(default_factory=dict)


class MiningTriggerResponse(BaseModel):
    status: str
    run_id: Optional[str] = None
    message: str
