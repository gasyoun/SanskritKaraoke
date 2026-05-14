"""
Sanskrit Karaoke — Teaching Pipeline
=====================================
A LangGraph-based multi-agent pipeline for verse curation and student SRS management.

Architecture:
  Entry → route_start → [curator | analyzer]
  curator → route_after_curator → [enricher | END (on failure)]
  enricher → quality_gate → END
  analyzer → END

Modules:
  state.py        — AgentState TypedDict + VerseData Pydantic model
  nodes.py        — Pipeline node functions (verse_curator, content_enricher, etc.)
  graph.py        — LangGraph graph construction + pipeline singleton
  llm.py          — Multi-provider LLM dispatcher (Gemini / Anthropic / OpenRouter)
  persistence.py  — Checkpointer factory (PostgreSQL / SQLite / MemorySaver)

Usage:
  from agents.teaching_pipeline.graph import pipeline
  result = await pipeline.ainvoke(initial_state, config={"configurable": {"thread_id": "..."}})
"""
from .graph import pipeline

__all__ = ["pipeline"]
