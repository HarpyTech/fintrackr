"""
Static sanity check for mongo_guard wiring.

Parses the guard and asserts the pieces that must be present are, without
needing pydantic or a database. Complements test_mongo_guard.py, which needs
the real imports.

    python -m tests._check_guard_wiring
"""

import ast
import pathlib
import sys

SRC = pathlib.Path(__file__).resolve().parent.parent / "app" / "services" / "mongo_guard.py"


def main() -> int:
    text = SRC.read_text(encoding="utf-8")
    tree = ast.parse(text)

    functions = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
    }

    required_functions = {
        "_walk_expression",
        "_walk_projection",
        "_walk_predicate",
        "_walk_predicate_value",
        "_walk_stage",
        "_is_alias",
        "_check_field_name",
        "_check_field_path",
        "_check_regex",
        "validate_and_compile",
    }

    missing = sorted(required_functions - functions)
    problems = []
    if missing:
        problems.append(f"missing functions: {missing}")

    # $project must route to the projection walker, not the generic expression
    # walker, or `{"$project": {"password_hash": 1}}` passes as an alias.
    if '"$project"' not in text or "_walk_projection(body" not in text:
        problems.append("$project is not routed to _walk_projection")

    # Write/join/JS stages must be absent from the allow-list.
    for forbidden in ("$out", "$merge", "$lookup", "$graphLookup",
                      "$unionWith", "$where", "$function", "$accumulator"):
        # Appearing in a comment or a docstring is fine; appearing inside the
        # ALLOWED_* frozensets is not.
        for name in ("ALLOWED_STAGES", "ALLOWED_QUERY_OPERATORS",
                     "ALLOWED_EXPRESSION_OPERATORS"):
            start = text.find(name)
            if start == -1:
                continue
            end = text.find("})", start)
            block = text[start:end if end != -1 else start + 1200]
            if f'"{forbidden}"' in block:
                problems.append(f"{forbidden} appears in {name}")

    # The scope stage must be forced, not merged from model output.
    if '{"$match": scope_match}' not in text:
        problems.append("stage 0 is not a forced scope $match")

    if problems:
        print("PROBLEMS:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("guard wiring OK")
    print(f"  functions present: {len(required_functions)}")
    print("  $project -> _walk_projection")
    print("  no write/join/JS operator on any allow-list")
    print("  stage 0 scope $match is forced")
    return 0


if __name__ == "__main__":
    sys.exit(main())
