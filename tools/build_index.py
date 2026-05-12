import sys
import os
import json
import datetime
from glob import glob

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

def main():
    data_files = glob(os.path.join("verses", "data", "*.json"))
    
    verses_list = []
    for file_path in data_files:
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
                verse_info = {
                    "id": data.get("id"),
                    "title": data.get("title"),
                    "meter": data.get("meter"),
                    "difficulty": data.get("difficulty"),
                    "language_tags": data.get("language_tags", []),
                    "tags": data.get("tags", []),
                    "has_audio": bool(data.get("audio", {}).get("drive_file_id") and data["audio"]["drive_file_id"] != "TODO"),
                    "has_session": bool(data.get("session", {}).get("drive_file_id") and data["session"]["drive_file_id"] != "TODO"),
                    "created_at": data.get("created_at")
                }
                verses_list.append(verse_info)
            except Exception as e:
                print(f"Error processing {file_path}: {e}")
                
    # Sort verses by difficulty then created_at
    verses_list.sort(key=lambda x: (x.get("difficulty", 999), x.get("created_at", "")))

    index_data = {
        "version": 1,
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d"),
        "verses": verses_list
    }
    
    index_path = os.path.join("verses", "index.json")
    os.makedirs(os.path.dirname(index_path), exist_ok=True)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)
        
    print(f"verses/index.json written ({len(verses_list)} verse(s))")

if __name__ == "__main__":
    main()
