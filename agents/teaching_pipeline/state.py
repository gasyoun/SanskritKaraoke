from typing import Annotated, List, Optional, Union, Dict, TypedDict
import operator
from pydantic import BaseModel, Field


def replace_list(existing: list, new: list) -> list:
    """Replace the list entirely instead of appending.
    Prevents error/recommendation accumulation across re-runs."""
    return new


class VerseData(BaseModel):
    id: str = Field(..., description="Unique slug for the verse")
    title: Dict[str, str] = Field(default_factory=dict)
    source: Union[str, Dict[str, str]] = ""
    meter: str = "unknown"
    difficulty: int = 1
    encoding: str = "IAST"
    s1: str
    s2: str
    translation: Dict[str, str] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    version: int = 1


class AgentState(TypedDict):
    # The primary data being processed (Pydantic model, serialized to dict in checkpoints)
    verse: Optional[VerseData]

    # Track the current status/phase
    current_phase: str

    # Uses replace_list so re-running a thread does not duplicate errors
    errors: Annotated[List[str], replace_list]

    # Message history accumulates across nodes
    messages: Annotated[List[dict], operator.add]

    # Metadata about the session
    student_id: Optional[str]
    student_history: Optional[List[dict]]
    recommendations: Annotated[List[str], replace_list]
    is_published: bool
