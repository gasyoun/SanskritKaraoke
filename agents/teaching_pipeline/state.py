from typing import TypedDict, Annotated, List, Optional, Union
import operator

class VerseData(TypedDict):
    id: str
    title: dict  # {"ru": "...", "en": "..."}
    source: Union[str, dict]
    meter: str
    difficulty: int
    encoding: str
    s1: str
    s2: str
    translation: dict
    tags: List[str]
    created_at: str
    updated_at: Optional[str]

class AgentState(TypedDict):
    # The primary data being processed
    verse: Optional[VerseData]
    
    # Track the current status/phase
    current_phase: str
    
    # List of issues found by QualityGate or VerseCurator
    errors: Annotated[List[str], operator.add]
    
    # History of agent messages (for the supervisor/enricher)
    messages: Annotated[List[dict], operator.add]
    
    # Metadata about the session
    student_id: Optional[str]
    student_history: Optional[List[dict]] # SRS records
    recommendations: Annotated[List[str], operator.add]
    is_published: bool
