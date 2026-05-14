"""Generate the deployed student player from its canonical template.

Historically this script tried to derive student.html from index.html with a
series of regex substitutions. That made student.html and the generator drift:
running the generator could silently remove student-only features. The template
is now the single source of truth.
"""

from __future__ import annotations

import argparse
import difflib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATE = ROOT / "tools" / "templates" / "student.html"
DEFAULT_OUTPUT = ROOT / "student.html"


def _relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def _render_diff(expected: bytes, actual: bytes, template: Path, output: Path) -> str:
    expected_text = expected.decode("utf-8", errors="replace").splitlines()
    actual_text = actual.decode("utf-8", errors="replace").splitlines()
    lines = difflib.unified_diff(
        actual_text,
        expected_text,
        fromfile=_relative(output),
        tofile=_relative(template),
        lineterm="",
    )
    return "\n".join(lines)


def generate(template: Path = DEFAULT_TEMPLATE, output: Path = DEFAULT_OUTPUT) -> None:
    if not template.exists():
        raise FileNotFoundError(f"Template not found: {_relative(template)}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(template.read_bytes())
    print(f"{_relative(output)} generated from {_relative(template)}")


def check(template: Path = DEFAULT_TEMPLATE, output: Path = DEFAULT_OUTPUT) -> bool:
    if not template.exists():
        print(f"{_relative(template)} is missing.")
        return False

    expected = template.read_bytes()
    try:
        actual = output.read_bytes()
    except FileNotFoundError:
        print(f"{_relative(output)} is missing; run python tools/make_student.py")
        return False

    if actual == expected:
        print(f"{_relative(output)} is up to date.")
        return True

    print(f"{_relative(output)} is out of date. Run python tools/make_student.py")
    print(_render_diff(expected, actual, template, output))
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if student.html differs from the canonical template",
    )
    parser.add_argument(
        "--template",
        type=Path,
        default=DEFAULT_TEMPLATE,
        help="template to copy from",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="output file to write or check",
    )
    args = parser.parse_args()

    template = args.template.resolve()
    output = args.output.resolve()

    if args.check:
        return 0 if check(template, output) else 1

    generate(template, output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
