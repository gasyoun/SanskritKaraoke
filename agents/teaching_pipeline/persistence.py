import os
from langgraph.checkpoint.memory import MemorySaver

def get_checkpointer():
    """
    Returns the appropriate checkpointer based on environment configuration.
    Defaults to MemorySaver for local dev, uses PostgresSaver for production.
    """
    db_url = os.getenv("DATABASE_URL")
    
    if db_url:
        try:
            # Postgres persistence for production
            from langgraph.checkpoint.postgres import PostgresSaver
            import psycopg2
            conn = psycopg2.connect(db_url)
            saver = PostgresSaver(conn)
            saver.setup()
            return saver
        except (ImportError, Exception) as e:
            print(f"Warning: Failed to initialize PostgresSaver: {e}")
            
    # Local persistent fallback
    try:
        from langgraph.checkpoint.sqlite import SqliteSaver
        import sqlite3
        # Create a local persistent database file
        conn = sqlite3.connect("teaching_pipeline.db", check_same_thread=False)
        return SqliteSaver(conn)
    except Exception as e:
        print(f"Warning: Failed to initialize SqliteSaver: {e}")
        return MemorySaver()
