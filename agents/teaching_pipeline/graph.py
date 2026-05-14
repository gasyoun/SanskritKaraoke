from langgraph.graph import StateGraph, END
from .state import AgentState
from .nodes import verse_curator, content_enricher, quality_gate, student_analyzer


def route_start(state: AgentState) -> str:
    """Entry-point router. Routes to analyzer if this is a student session
    (has student_id but no verse to process), otherwise to curator."""
    has_verse = bool(state.get("verse"))
    has_student = bool(state.get("student_id"))
    if has_student and not has_verse:
        return "analyzer"
    return "curator"


def route_after_curator(state: AgentState) -> str:
    """Short-circuit router. Stops the pipeline if the curator failed."""
    if state.get("current_phase") == "curation_failed":
        return "end"
    return "enricher"


def create_teaching_pipeline():
    """
    Constructs the LangGraph for the Sanskrit Karaoke teaching pipeline.
    Includes two tracks: Curation and Student Analysis.
    """
    workflow = StateGraph(AgentState)

    # Nodes
    workflow.add_node("curator", verse_curator)
    workflow.add_node("enricher", content_enricher)
    workflow.add_node("quality_gate", quality_gate)
    workflow.add_node("analyzer", student_analyzer)

    # Entry routing
    workflow.set_conditional_entry_point(
        route_start,
        {"analyzer": "analyzer", "curator": "curator"}
    )

    # Curation track — short-circuits to END on curator failure
    workflow.add_conditional_edges(
        "curator",
        route_after_curator,
        {"end": END, "enricher": "enricher"}
    )
    workflow.add_edge("enricher", "quality_gate")
    workflow.add_edge("quality_gate", END)

    # Student track
    workflow.add_edge("analyzer", END)

    # Compile with persistence checkpointer
    from .persistence import get_checkpointer
    memory = get_checkpointer()
    return workflow.compile(checkpointer=memory)


pipeline = create_teaching_pipeline()
