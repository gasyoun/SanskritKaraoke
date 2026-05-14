from langgraph.graph import StateGraph, END
from .state import AgentState
from .nodes import verse_curator, content_enricher, quality_gate, student_analyzer

def create_teaching_pipeline():
    """
    Constructs the LangGraph for the Sanskrit Karaoke teaching pipeline.
    Includes both Curation and Student Analysis tracks.
    """
    workflow = StateGraph(AgentState)

    # Add Nodes
    workflow.add_node("curator", verse_curator)
    workflow.add_node("enricher", content_enricher)
    workflow.add_node("quality_gate", quality_gate)
    workflow.add_node("analyzer", student_analyzer)

    # Supervisor logic (Routing)
    def route_start(state: AgentState):
        if state.get("student_id") and not state.get("verse"):
            return "analyzer"
        return "curator"

    # Define Edges
    workflow.set_conditional_entry_point(
        route_start,
        {
            "analyzer": "analyzer",
            "curator": "curator"
        }
    )
    
    # Curation Track — short-circuit on curator failure
    def route_after_curator(state: AgentState) -> str:
        if state.get("current_phase") == "curation_failed":
            return "end"
        return "enricher"

    workflow.add_conditional_edges(
        "curator",
        route_after_curator,
        {"end": END, "enricher": "enricher"}
    )
    workflow.add_edge("enricher", "quality_gate")
    workflow.add_edge("quality_gate", END)

    # Student Track
    workflow.add_edge("analyzer", END)

    # Compile with memory
    from .persistence import get_checkpointer
    memory = get_checkpointer()
    
    return workflow.compile(checkpointer=memory)

pipeline = create_teaching_pipeline()
