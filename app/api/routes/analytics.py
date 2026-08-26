"""
Analytics agent endpoints.

    POST /api/v1/insights/ask         full answer in one response
    POST /api/v1/insights/ask/stream  same answer, streamed as SSE
    GET  /api/v1/insights/overview    KPI strip figures
    GET  /api/v1/insights/history     last N chat answers for this user

Concurrency note: pymongo and the Gemini SDK are both synchronous. Every call
into them goes through run_in_threadpool, otherwise the agent's 2-5s of blocking
work would stall the event loop and, with SSE connections held open, take other
requests down with it. The container runs `gunicorn -w 2`, so the event loop is
a shared resource worth protecting.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.db.mongo import get_insight_history_collection
from app.services.analytics_agent_service import build_overview, run_analytics_agent

logger = logging.getLogger(__name__)

router = APIRouter()


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    session_id: str = Field("", max_length=64)


def _save_to_history(username: str, answer: dict) -> None:
    """Persist a completed answer envelope to the insight_history collection.

    Wrapped in a bare except so a write failure never surfaces to the caller.
    The history collection has a 90-day TTL index on `created_at`.
    """
    try:
        doc = {
            "username": username,
            "created_at": datetime.now(UTC),
            **answer,
        }
        get_insight_history_collection().insert_one(doc)
    except Exception:
        logger.warning("Failed to save insight history for %s", username, exc_info=True)


@router.post("/ask")
async def ask(payload: AskRequest, user: str = Depends(get_current_user)):
    """Answer a question about the caller's expenses."""
    try:
        result = await run_in_threadpool(
            run_analytics_agent,
            user,
            payload.question,
            session_id=payload.session_id,
        )
        _save_to_history(user, result)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.error("Analytics agent failed for %s: %s", user, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Insights are temporarily unavailable. Please try again.",
        ) from exc


def _sse(event: str, data: dict) -> bytes:
    """Encode one Server-Sent Event frame."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode()


@router.post("/ask/stream")
async def ask_stream(payload: AskRequest, user: str = Depends(get_current_user)):
    """
    Same answer as /ask, streamed so the UI can show real progress.

    Phases are emitted by the orchestrator as it works. The final `done` frame
    carries the identical envelope /ask returns, so the client can share one
    renderer for both paths.
    """
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def on_phase(name: str, label: str) -> None:
        # Called from the worker thread; hop back onto the loop to enqueue.
        loop.call_soon_threadsafe(
            queue.put_nowait, ("phase", {"name": name, "label": label})
        )

    async def worker() -> None:
        try:
            answer = await run_in_threadpool(
                run_analytics_agent,
                user,
                payload.question,
                session_id=payload.session_id,
                on_phase=on_phase,
            )
            _save_to_history(user, answer)
            await queue.put(("done", answer))
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Streaming analytics failed for %s: %s", user, exc, exc_info=True
            )
            await queue.put((
                "error",
                {"detail": "Insights are temporarily unavailable."},
            ))
        finally:
            await queue.put(("__eof__", {}))

    async def generator():
        task = asyncio.create_task(worker())
        try:
            # An immediate frame defeats any proxy that waits for first bytes
            # before committing the response.
            yield _sse("phase", {"name": "queued", "label": "Starting"})

            while True:
                event, data = await queue.get()
                if event == "__eof__":
                    break
                yield _sse(event, data)
        except asyncio.CancelledError:
            # Client navigated away or aborted; stop the worker.
            task.cancel()
            raise
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, no-transform",
            "Connection": "keep-alive",
            # Defensive: tells nginx-style proxies not to buffer the stream.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history")
async def history(
    user: str = Depends(get_current_user),
    limit: int = Query(20, ge=1, le=50),
):
    """Return the last `limit` answers for this user, oldest first (chat order)."""
    try:
        def _fetch():
            docs = list(
                get_insight_history_collection()
                .find(
                    {"username": user},
                    {"_id": 0, "username": 0},
                )
                .sort("created_at", -1)
                .limit(limit)
            )
            # Reverse so the result is oldest-first for the chat transcript.
            docs.reverse()
            # Strip the internal created_at timestamp before returning.
            for doc in docs:
                doc.pop("created_at", None)
            return docs

        items = await run_in_threadpool(_fetch)
        return {"items": items}
    except Exception as exc:  # noqa: BLE001
        logger.error("History fetch failed for %s: %s", user, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not load your conversation history.",
        ) from exc


@router.get("/overview")
async def overview(user: str = Depends(get_current_user)):
    """Real KPI figures, replacing the client-side derivation."""
    try:
        return await run_in_threadpool(build_overview, user)
    except Exception as exc:  # noqa: BLE001
        logger.error("Overview failed for %s: %s", user, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not load your overview.",
        ) from exc
