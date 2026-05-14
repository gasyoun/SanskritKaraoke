import sys
import json
import os
import jsonschema

def validate_verse_file(file_path):
    """
    Validates a single verse JSON file against the project schema.
    """
    schema_path = os.path.join("verses", "schema", "verse.schema.json")
    
    if not os.path.exists(schema_path):
        print(f"Error: Schema not found at {schema_path}")
        sys.exit(1)
        
    try:
        with open(schema_path, "r", encoding="utf-8") as f:
            schema = json.load(f)
            
        with open(file_path, "r", encoding="utf-8") as f:
            instance = json.load(f)
            
        jsonschema.validate(instance=instance, schema=schema)
        print(f"✓ {os.path.basename(file_path)} is valid.")
        return True
    except jsonschema.exceptions.ValidationError as e:
        print(f"✗ {os.path.basename(file_path)} validation failed:")
        print(f"  Field: {'.'.join(str(v) for v in e.path)}")
        print(f"  Issue: {e.message}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tools/validate_verse.py <path_to_verse.json>")
        sys.exit(1)
        
    success = validate_verse_file(sys.argv[1])
    sys.exit(0 if success else 1)
