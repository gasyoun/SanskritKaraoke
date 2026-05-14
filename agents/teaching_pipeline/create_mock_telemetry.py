import json
from pathlib import Path

def create_mock_telemetry():
    log_file = Path("logs/mock_telemetry.json")
    log_file.parent.mkdir(exist_ok=True)
    
    mocks = [
        {"timestamp": "2026-05-15T00:00:00", "verse_id": "bhg_2_47", "event": "verse_load", "data": {}},
        {"timestamp": "2026-05-15T00:01:00", "verse_id": "bhg_2_47", "event": "mode_change", "data": {"mode": "mode-dots"}},
        {"timestamp": "2026-05-15T00:02:00", "verse_id": "bhg_2_47", "event": "quiz_result", "data": {"type": "meter", "success": True, "selected": "anushtubh"}},
        {"timestamp": "2026-05-15T00:03:00", "verse_id": "bhg_2_47", "event": "srs_rating", "data": {"quality": 5}},
        
        {"timestamp": "2026-05-15T00:10:00", "verse_id": "kum_1_1", "event": "verse_load", "data": {}},
        {"timestamp": "2026-05-15T00:11:00", "verse_id": "kum_1_1", "event": "mode_change", "data": {"mode": "mode-blind"}},
        {"timestamp": "2026-05-15T00:12:00", "verse_id": "kum_1_1", "event": "quiz_result", "data": {"type": "fillin", "success": False, "input": "...", "correct": "sthitah"}},
        {"timestamp": "2026-05-15T00:13:00", "verse_id": "kum_1_1", "event": "srs_rating", "data": {"quality": 1}},
        
        {"timestamp": "2026-05-15T00:20:00", "verse_id": "kum_1_1", "event": "quiz_result", "data": {"type": "beattap", "percent": 45, "total": 10, "correct": 4}},
    ]
    
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(mocks, f)
    print("Mock telemetry created successfully.")

if __name__ == "__main__":
    create_mock_telemetry()
