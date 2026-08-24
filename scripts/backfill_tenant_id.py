"""One-time backfill: set tenant_id = username on all documents lacking tenant_id.

Run once against an existing database to populate tenant_id for legacy records:

    python scripts/backfill_tenant_id.py

Requires MONGODB_URI and MONGODB_DB env vars (or a .env file at the project root).
Safe to re-run — documents that already have tenant_id are untouched (the update
filter excludes them).
"""

import os
import sys
from pathlib import Path

# Allow importing app modules when run from project root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load .env if present so MONGODB_URI etc. are available without manual export.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass  # python-dotenv optional; env vars must be set externally

from pymongo import MongoClient  # noqa: E402

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB = os.environ.get("MONGODB_DB", "my_finance")

COLLECTIONS = ["users", "expenses", "expense_line_items"]


def backfill(db) -> None:
    for collection_name in COLLECTIONS:
        coll = db[collection_name]
        # Only update documents that are missing the field entirely.
        query = {"tenant_id": {"$exists": False}, "username": {"$exists": True}}
        total = coll.count_documents(query)
        if total == 0:
            print(f"[{collection_name}] nothing to backfill — all documents have tenant_id")
            continue

        # Use a pipeline update to copy username → tenant_id atomically.
        result = coll.update_many(
            query,
            [{"$set": {"tenant_id": "$username"}}],
        )
        print(
            f"[{collection_name}] backfilled {result.modified_count}/{total} documents"
        )


if __name__ == "__main__":
    client = MongoClient(MONGODB_URI)
    db = client[MONGODB_DB]
    print(f"Connecting to {MONGODB_URI}, db={MONGODB_DB}")
    backfill(db)
    print("Backfill complete.")
    client.close()
