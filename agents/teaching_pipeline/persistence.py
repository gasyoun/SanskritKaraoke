import os
from langgraph.checkpoint.memory import MemorySaver


def get_checkpointer():
    """
    Returns the appropriate checkpointer based on environment configuration.
    Priority: PostgreSQL (psycopg v3) → SQLite → MemorySaver (dev fallback).

    Note: psycopg (v3, async-compatible) is required for PostgreSQL.
    psycopg2 (v2, sync-only) will NOT work in an async LangGraph pipeline.
    Install: pip install psycopg[binary]
    """
    db_url = os.getenv("DATABASE_URL")

    if db_url:
        # Try psycopg v3 (async-compatible) first
        try:
            from langgraph.checkpoint.postgres import PostgresSaver
            import psycopg  # v3 — async-compatible
            conn = psycopg.connect(db_url)
            saver = PostgresSaver(conn)
            saver.setup()
            return saver
        except ImportError:
            print("Warning: psycopg (v3) not installed. Run: pip install psycopg[binary]")
        except Exception as e:
            print(f"Warning: Failed to initialize PostgresSaver (psycopg v3): {e}")

        # Fallback: try psycopg2 — will work for sync-only usage
        try:
            from langgraph.checkpoint.postgres import PostgresSaver
            import psycopg2
            conn = psycopg2.connect(db_url)
            saver = PostgresSaver(conn)
            saver.setup()
            print("Warning: Using psycopg2 (sync). Async pipeline may be unstable. Upgrade to psycopg v3.")
            return saver
        except Exception as e:
            print(f"Warning: Failed to initialize PostgresSaver (psycopg2): {e}")

    # Local persistent fallback
    try:
        from langgraph.checkpoint.sqlite import SqliteSaver
        import sqlite3
        conn = sqlite3.connect("teaching_pipeline.db", check_same_thread=False)
        return SqliteSaver(conn)
    except Exception as e:
        print(f"Warning: Failed to initialize SqliteSaver: {e}. Falling back to MemorySaver.")
        return MemorySaver()
