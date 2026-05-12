import sys
import os
import json
import jsonschema
from glob import glob

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

def main():
    schema_path = os.path.join("verses", "schema", "verse.schema.json")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    data_files = glob(os.path.join("verses", "data", "*.json"))
    if not data_files:
        print("No verse files found in verses/data/")
        sys.exit(1)

    errors = 0
    for file_path in data_files:
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                instance = json.load(f)
                jsonschema.validate(instance=instance, schema=schema)
                print(f"✓ {os.path.basename(file_path)}")
            except json.JSONDecodeError as e:
                print(f"✗ {os.path.basename(file_path)}: Invalid JSON ({e})")
                errors += 1
            except jsonschema.exceptions.ValidationError as e:
                print(f"✗ {os.path.basename(file_path)}: Schema validation failed")
                print(f"  {e.message}")
                errors += 1

    if errors == 0:
        print(f"All {len(data_files)} verse(s) valid.")
        sys.exit(0)
    else:
        print(f"Failed: {errors} verse(s) had errors.")
        sys.exit(1)

if __name__ == "__main__":
    main()
