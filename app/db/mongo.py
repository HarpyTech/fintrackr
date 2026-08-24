import logging

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import OperationFailure, PyMongoError

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: MongoClient | None = None
_resolved_db_name: str | None = None


def _summarize_db_error(exc: Exception) -> str:
    """Return a safe, concise DB error summary without query details."""
    if isinstance(exc, OperationFailure):
        code = getattr(exc, "code", "unknown")
        code_name = getattr(exc, "codeName", "OperationFailure")
        return f"{code_name} (code={code})"
    return type(exc).__name__


def _resolve_database_name(client: MongoClient) -> str:
    """Resolve an accessible application DB name."""
    candidates: list[str] = [settings.MONGODB_DB]
    if settings.MONGODB_DB != "my_finance":
        candidates.append("my_finance")

    for db_name in candidates:
        try:
            # Read check to verify this identity can use the DB.
            client[db_name]["users"].find_one({}, {"_id": 1})
            logger.info(f"Using MongoDB database: {db_name}")
            return db_name
        except OperationFailure as exc:
            logger.warning(
                "No read access to database '%s': %s",
                db_name,
                _summarize_db_error(exc),
            )
            continue

    raise RuntimeError(
        "MongoDB user is not authorized for configured databases. "
        "Grant readWrite on target DB in Atlas and set MONGODB_DB."
    )


def _safe_create_indexes(
    collection: Collection,
    index_specs: list[dict],
) -> None:
    """Create indexes if allowed; do not fail requests on permission issues."""
    for spec in index_specs:
        try:
            if spec["kind"] == "single":
                collection.create_index(
                    spec["field"],
                    unique=spec.get("unique", False),
                )
            else:
                collection.create_index(spec["fields"])
        except OperationFailure as exc:
            logger.warning(
                "Skipping index creation due to DB permissions: %s",
                _summarize_db_error(exc),
            )
        except PyMongoError as exc:
            logger.warning(
                "Skipping index creation due to DB error: %s",
                _summarize_db_error(exc),
            )


def get_mongo_client() -> MongoClient:
    """Get or create MongoDB client connection"""
    global _client
    if _client is None:
        try:
            logger.info("Connecting to MongoDB")
            _client = MongoClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=3000,
            )
            # Test the connection
            _client.admin.command("ping")
            logger.info("Successfully connected to MongoDB")
        except PyMongoError as exc:
            logger.error(
                "Failed to connect to MongoDB: %s",
                _summarize_db_error(exc),
                exc_info=True,
            )
            raise
    return _client


def get_database() -> Database:
    """Get the application database"""
    global _resolved_db_name
    try:
        client = get_mongo_client()
        if _resolved_db_name is None:
            _resolved_db_name = _resolve_database_name(client)
        db = client[_resolved_db_name]
        logger.debug(f"Accessing database: {_resolved_db_name}")
        return db
    except Exception:
        logger.error("Failed to access database", exc_info=True)
        raise


def get_users_collection() -> Collection:
    """Get the users collection."""
    try:
        collection = get_database()["users"]
        logger.debug("Users collection accessed")
        return collection
    except PyMongoError:
        logger.error("Failed to access users collection", exc_info=True)
        raise
    except Exception:
        logger.error("Unexpected error accessing users collection", exc_info=True)
        raise


def get_expenses_collection() -> Collection:
    """Get the expenses collection."""
    try:
        collection = get_database()["expenses"]
        logger.debug("Expenses collection accessed")
        return collection
    except PyMongoError:
        logger.error("Failed to access expenses collection", exc_info=True)
        raise
    except Exception:
        logger.error("Unexpected error accessing expenses collection", exc_info=True)
        raise


def get_expense_line_items_collection() -> Collection:
    """Get dedicated expense line items collection."""
    try:
        collection = get_database()["expense_line_items"]
        logger.debug("Expense line items collection accessed")
        return collection
    except PyMongoError:
        logger.error("Failed to access expense line items collection", exc_info=True)
        raise
    except Exception:
        logger.error(
            "Unexpected error accessing expense line items collection", exc_info=True
        )
        raise


def get_webauthn_credentials_collection() -> Collection:
    """Get the webauthn_credentials collection."""
    try:
        collection = get_database()["webauthn_credentials"]
        logger.debug("WebAuthn credentials collection accessed")
        return collection
    except PyMongoError:
        logger.error("Failed to access webauthn_credentials collection", exc_info=True)
        raise
    except Exception:
        logger.error(
            "Unexpected error accessing webauthn_credentials collection", exc_info=True
        )
        raise


def get_webauthn_challenges_collection() -> Collection:
    """Get the webauthn_challenges collection. Challenges expire after 5 minutes."""
    try:
        collection = get_database()["webauthn_challenges"]
        logger.debug("WebAuthn challenges collection accessed")
        return collection
    except PyMongoError:
        logger.error("Failed to access webauthn_challenges collection", exc_info=True)
        raise
    except Exception:
        logger.error(
            "Unexpected error accessing webauthn_challenges collection", exc_info=True
        )
        raise


def get_refresh_tokens_collection() -> Collection:
    """Get the refresh_tokens collection."""
    try:
        collection = get_database()["refresh_tokens"]
        logger.debug("Refresh tokens collection accessed")
        return collection
    except PyMongoError:
        logger.error("Failed to access refresh_tokens collection", exc_info=True)
        raise
    except Exception:
        logger.error(
            "Unexpected error accessing refresh_tokens collection", exc_info=True
        )
        raise


def get_idempotency_collection() -> Collection:
    """Get the idempotency_keys collection (24h TTL cache for POST dedupe)."""
    try:
        collection = get_database()["idempotency_keys"]
        logger.debug("Idempotency keys collection accessed")
        return collection
    except PyMongoError:
        logger.error("Failed to access idempotency_keys collection", exc_info=True)
        raise
    except Exception:
        logger.error(
            "Unexpected error accessing idempotency_keys collection", exc_info=True
        )
        raise


def bootstrap_indexes() -> None:
    """Create all collection indexes once at application startup.

    Replaces the per-request _safe_create_indexes calls that used to run
    inside each get_*_collection() accessor. Calling create_index on an
    already-existing index is a no-op on the server, but still incurs a
    round-trip per request — running it once here removes that overhead.
    """
    try:
        db = get_database()

        _safe_create_indexes(
            db["users"],
            [
                {"kind": "single", "field": "username", "unique": True},
                {"kind": "single", "field": "tenant_id", "unique": False},
            ],
        )

        _safe_create_indexes(
            db["expenses"],
            [
                {"kind": "compound", "fields": [("username", 1), ("expense_date", -1)]},
                {"kind": "compound", "fields": [("username", 1), ("bill_type", 1)]},
                {"kind": "compound", "fields": [("tenant_id", 1), ("username", 1)]},
                {
                    "kind": "compound",
                    "fields": [("tenant_id", 1), ("expense_date", -1)],
                },
                {"kind": "single", "field": "is_deleted", "unique": False},
            ],
        )

        _safe_create_indexes(
            db["expense_line_items"],
            [
                {"kind": "compound", "fields": [("expense_id", 1), ("username", 1)]},
                {"kind": "compound", "fields": [("username", 1), ("created_at", -1)]},
            ],
        )

        _safe_create_indexes(
            db["webauthn_credentials"],
            [
                {"kind": "single", "field": "credential_id", "unique": True},
                {"kind": "compound", "fields": [("username", 1), ("device_id", 1)]},
            ],
        )

        _safe_create_indexes(
            db["webauthn_challenges"],
            [
                {"kind": "single", "field": "expires_at", "unique": False},
                {"kind": "compound", "fields": [("username", 1), ("type", 1)]},
            ],
        )
        try:
            db["webauthn_challenges"].create_index("expires_at", expireAfterSeconds=0)
        except Exception:
            pass

        _safe_create_indexes(
            db["refresh_tokens"],
            [
                {"kind": "single", "field": "token_hash", "unique": True},
                {"kind": "compound", "fields": [("username", 1), ("device_id", 1)]},
            ],
        )
        try:
            db["refresh_tokens"].create_index("expires_at", expireAfterSeconds=0)
        except Exception:
            pass

        _safe_create_indexes(
            db["idempotency_keys"],
            [
                {"kind": "compound", "fields": [("key", 1), ("user_id", 1)]},
            ],
        )
        try:
            db["idempotency_keys"].create_index(
                "created_at",
                expireAfterSeconds=86400,
                unique=False,
            )
        except Exception:
            pass

        logger.info("Database indexes bootstrapped successfully")
    except Exception:
        logger.warning(
            "Could not bootstrap indexes — will retry on next startup", exc_info=True
        )


def backfill_tenant_ids(db: Database | None = None) -> None:
    """Populate tenant IDs on legacy documents that do not have one."""
    try:
        logger.info("Starting tenant ID backfill")
        if db is None:
            db = get_database()
        for collection_name in ("users", "expenses", "expense_line_items"):
            query = {
                "tenant_id": {"$exists": False},
                "username": {"$exists": True},
            }
            result = db[collection_name].update_many(
                query,
                [{"$set": {"tenant_id": "$username"}}],
            )
            logger.info(
                "Tenant ID backfill checked %s: matched=%d modified=%d",
                collection_name,
                result.matched_count,
                result.modified_count,
            )
        logger.info("Tenant ID backfill completed successfully")
    except Exception:
        logger.warning(
            "Could not backfill tenant IDs — will retry on next startup", exc_info=True
        )


def ping_database() -> bool:
    """Ping the database to check connectivity"""
    try:
        get_mongo_client().admin.command("ping")
        logger.debug("Database ping successful")
        return True
    except PyMongoError as exc:
        logger.warning(
            "Database ping failed: %s",
            _summarize_db_error(exc),
        )
        return False
    except Exception:
        logger.error(
            "Unexpected error during database ping",
            exc_info=True,
        )
        return False
