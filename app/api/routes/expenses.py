# ruff: noqa: I001

import logging
from datetime import date

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_tenant, get_current_user
from app.core.idempotency import get_idempotency_response, store_idempotency_response
from app.models.expense import (
    ExpenseChatCreateRequest,
    ExpenseCreate,
    ExpenseInputType,
    ExpenseUpdate,
)
from app.services.expense_chat_service import (
    answer_expense_analysis_query,
    looks_like_expense_analysis_request,
)
from app.services.expense_extraction_service import (
    ExpenseExtractionValidationError,
    extract_expense_payload,
    extract_text_chat_expense_payload,
)
from app.services.expense_service import (
    add_expense,
    category_summary,
    categories_monthly_summary,
    check_session_expense_limit,
    daily_summary,
    delete_expense,
    get_expense,
    get_expense_limit_status,
    list_expenses,
    monthly_summary,
    SessionExpenseLimitError,
    update_expense,
    vendors_monthly_summary,
    yearly_summary,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", status_code=201)
def create_expense(
    payload: ExpenseCreate,
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    """Create a new expense"""
    logger.info("Create expense request received")
    if idempotency_key:
        cached = get_idempotency_response(idempotency_key, user)
        if cached is not None:
            logger.info(
                "Returning cached response for Idempotency-Key=%s", idempotency_key
            )
            return cached
    try:
        check_session_expense_limit(user, tenant_id=tenant_id)
        result = add_expense(
            username=user,
            amount=payload.amount,
            category=payload.category,
            bill_type=payload.bill_type,
            input_type=payload.input_type,
            invoice_number=payload.invoice_number,
            vendor=payload.vendor,
            description=payload.description,
            expense_date=payload.expense_date,
            line_items=[item.model_dump() for item in payload.line_items],
            tenant_id=tenant_id,
        )
        if idempotency_key:
            store_idempotency_response(idempotency_key, user, result)
        logger.info("Expense created successfully")
        return result
    except SessionExpenseLimitError as exc:
        logger.warning(
            "Session expense limit reached for user %s: %s",
            user,
            str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error(f"Service error creating expense: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error creating expense: {str(exc)}",
            exc_info=True,
        )
        raise


@router.post("/extract-and-create", status_code=201)
async def extract_and_create_expense(
    text_input: str | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    input_type: ExpenseInputType | None = Form(default=None),
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    """Extract expense details with Gemini and insert into DB."""
    logger.info("Extract-and-create expense request received")
    if idempotency_key:
        cached = get_idempotency_response(idempotency_key, user)
        if cached is not None:
            logger.info(
                "Returning cached response for Idempotency-Key=%s", idempotency_key
            )
            return cached
    try:
        # Enforce limit before reading image bytes or calling Gemini.
        check_session_expense_limit(user, tenant_id=tenant_id)
        raw_image_bytes: bytes | None = None
        if image is not None:
            # Keep upload untouched: read and forward original bytes as-is.
            raw_image_bytes = await image.read()

        mime_type = image.content_type if image else None
        extracted, used_llm_model = await run_in_threadpool(
            extract_expense_payload,
            text_input=text_input,
            image_bytes=raw_image_bytes,
            image_mime_type=mime_type,
        )
        del raw_image_bytes  # free original bytes early to reduce peak memory

        result = await run_in_threadpool(
            add_expense,
            username=user,
            amount=extracted["amount"],
            category=extracted["category"],
            bill_type=extracted["bill_type"],
            input_type=(input_type or _infer_input_type(text_input, image is not None)),
            invoice_number=extracted["invoice_number"],
            vendor=extracted["vendor"],
            description=extracted["description"],
            expense_date=date.fromisoformat(extracted["expense_date"]),
            llm_model=used_llm_model,
            line_items=extracted["line_items"],
            tenant_id=tenant_id,
        )

        logger.info("Expense extracted and created successfully")
        response = {
            "expense": result,
            "extracted": extracted,
            "llm_model": used_llm_model,
        }
        if idempotency_key:
            store_idempotency_response(idempotency_key, user, response)
        return response
    except ValueError as exc:
        logger.warning(f"Invalid extract-and-create request: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except SessionExpenseLimitError as exc:
        logger.warning(
            "Session expense limit reached for user %s: %s",
            user,
            str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error(f"Service error in extract-and-create: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error in extract-and-create: {str(exc)}",
            exc_info=True,
        )
        raise
    finally:
        if image is not None:
            await image.close()


@router.post("/chat-create", status_code=201)
async def create_expense_from_chat(
    payload: ExpenseChatCreateRequest,
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    """Extract expense fields from free-form text and create the expense."""
    logger.info("Chat expense create request received")
    if idempotency_key:
        cached = get_idempotency_response(idempotency_key, user)
        if cached is not None:
            logger.info(
                "Returning cached response for Idempotency-Key=%s", idempotency_key
            )
            return cached
    try:
        if looks_like_expense_analysis_request(payload.message):
            logger.info("Handling chat request as expense analysis query")
            return await run_in_threadpool(
                answer_expense_analysis_query,
                username=user,
                message=payload.message,
                tenant_id=tenant_id,
            )

        check_session_expense_limit(user, tenant_id=tenant_id)
        extracted, used_llm_model = await run_in_threadpool(
            extract_text_chat_expense_payload,
            payload.message,
        )

        # If vendor was not found and user hasn't confirmed, ask before saving
        if extracted.pop("_vendor_missing", False):
            logger.info("Chat expense missing vendor — asking user for confirmation")
            return {
                "needs_vendor_confirm": True,
                "message": (
                    "No vendor/merchant name was found. "
                    "Would you like to log this without a vendor, or provide the vendor name?"
                ),
            }

        result = await run_in_threadpool(
            add_expense,
            username=user,
            amount=extracted["amount"],
            category=extracted["category"],
            bill_type=extracted["bill_type"],
            input_type="text",
            invoice_number=extracted["invoice_number"],
            vendor=extracted["vendor"],
            description=extracted["description"],
            expense_date=date.fromisoformat(extracted["expense_date"]),
            llm_model=used_llm_model,
            line_items=[],
            tenant_id=tenant_id,
        )

        logger.info("Expense created successfully from chat")
        vendor_label = result.get("vendor") or "no vendor"
        chat_response = {
            "expense": result,
            "extracted": extracted,
            "llm_model": used_llm_model,
            "message": (
                f"Saved {vendor_label} for {result['amount']:.2f} "
                f"on {result['expense_date']}."
            ),
        }
        if idempotency_key:
            store_idempotency_response(idempotency_key, user, chat_response)
        return chat_response
    except ExpenseExtractionValidationError as exc:
        logger.warning(
            "Chat extraction needs more detail for user %s: %s",
            user,
            str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        logger.warning("Invalid chat expense request: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except SessionExpenseLimitError as exc:
        logger.warning(
            "Session expense limit reached for user %s: %s",
            user,
            str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error("Service error in chat expense create: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            "Unexpected error in chat expense create: %s",
            str(exc),
            exc_info=True,
        )
        raise


def _infer_input_type(
    text_input: str | None,
    has_image: bool,
) -> ExpenseInputType:
    if text_input and has_image:
        return "mixed"
    if has_image:
        return "image"
    return "text"


@router.get("")
def get_expenses(
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
    limit: int = Query(50, ge=1, le=200, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    sort_dir: int = Query(-1, description="Sort direction: -1 desc, 1 asc"),
):
    """Get expenses for the current user with pagination.

    Returns { items, total, limit, offset } so the client can render
    page controls without an extra count request.
    """
    logger.info("Get expenses request received (limit=%d, offset=%d)", limit, offset)
    try:
        result = list_expenses(
            user, limit=limit, offset=offset, sort_dir=sort_dir, tenant_id=tenant_id
        )
        logger.info("Retrieved %d/%d expenses", len(result["items"]), result["total"])
        return result
    except RuntimeError as exc:
        logger.error(f"Service error fetching expenses: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error fetching expenses: {str(exc)}",
            exc_info=True,
        )
        raise


@router.get("/limit-status")
def get_expense_limit_status_route(
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get expense-limit status for the current user."""
    logger.info("Expense limit status request received")
    try:
        result = get_expense_limit_status(user, tenant_id=tenant_id)
        logger.info(
            "Expense limit status retrieved for user %s: %d/%d",
            user,
            result["count"],
            result["limit"],
        )
        return result
    except RuntimeError as exc:
        logger.error(
            "Service error fetching expense limit status: %s",
            str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            "Unexpected error fetching expense limit status: %s",
            str(exc),
            exc_info=True,
        )
        raise


@router.get("/summary/monthly")
def get_monthly_summary(
    year: int = Query(default=date.today().year, ge=2000, le=2100),
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get monthly expense summary"""
    logger.info(f"Monthly summary request for year: {year}")
    try:
        result = {"items": monthly_summary(user, year, tenant_id=tenant_id)}
        logger.info(f"Monthly summary retrieved for year {year}")
        return result
    except RuntimeError as exc:
        logger.error(f"Service error fetching monthly summary: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error fetching monthly summary: {str(exc)}",
            exc_info=True,
        )
        raise


@router.get("/summary/yearly")
def get_yearly_summary(
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get yearly expense summary"""
    logger.info("Yearly summary request received")
    try:
        result = {"items": yearly_summary(user, tenant_id=tenant_id)}
        logger.info("Yearly summary retrieved")
        return result
    except RuntimeError as exc:
        logger.error(f"Service error fetching yearly summary: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error fetching yearly summary: {str(exc)}",
            exc_info=True,
        )
        raise


@router.get("/summary/categories")
def get_category_summary(
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get category-wise expense summary"""
    logger.info(f"Category summary request (year={year}, month={month})")
    try:
        result = {
            "items": category_summary(user, year=year, month=month, tenant_id=tenant_id)
        }
        logger.info(f"Category summary retrieved (year={year}, month={month})")
        return result
    except RuntimeError as exc:
        logger.error(f"Service error fetching category summary: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error fetching category summary: {str(exc)}",
            exc_info=True,
        )
        raise


@router.get("/summary/daily")
def get_daily_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get daily expense totals for a given year and month"""
    logger.info(f"Daily summary request for {year}-{month}")
    try:
        result = {"items": daily_summary(user, year, month, tenant_id=tenant_id)}
        logger.info(f"Daily summary retrieved for {year}-{month}")
        return result
    except RuntimeError as exc:
        logger.error(f"Service error fetching daily summary: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error fetching daily summary: {str(exc)}",
            exc_info=True,
        )
        raise


@router.get("/summary/categories-monthly")
def get_categories_monthly_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get category breakdown for a given year and month"""
    logger.info(f"Categories monthly summary request for {year}-{month}")
    try:
        result = {
            "items": categories_monthly_summary(user, year, month, tenant_id=tenant_id)
        }
        logger.info(f"Categories monthly summary retrieved for {year}-{month}")
        return result
    except RuntimeError as exc:
        logger.error(
            "Service error fetching categories monthly summary: %s",
            str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            "Unexpected error fetching categories monthly summary: %s",
            str(exc),
            exc_info=True,
        )
        raise


@router.get("/summary/vendors-monthly")
def get_vendors_monthly_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get vendor breakdown for a given year and month"""
    logger.info(f"Vendors monthly summary request for {year}-{month}")
    try:
        result = {
            "items": vendors_monthly_summary(user, year, month, tenant_id=tenant_id)
        }
        logger.info(f"Vendors monthly summary retrieved for {year}-{month}")
        return result
    except RuntimeError as exc:
        logger.error(
            "Service error fetching vendors monthly summary: %s",
            str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error fetching vendors monthly summary: {str(exc)}",
            exc_info=True,
        )
        raise


# ---------- Per-expense CRUD ----------


@router.get("/{expense_id}")
def get_expense_by_id(
    expense_id: str,
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Get a single expense by ID (must be owned by the current user)."""
    try:
        expense = get_expense(user, expense_id, tenant_id=tenant_id)
        if expense is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Expense not found",
            )
        return expense
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.patch("/{expense_id}")
def patch_expense(
    expense_id: str,
    body: ExpenseUpdate,
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Partially update an expense (must be owned by the current user)."""
    try:
        updated = update_expense(
            user, expense_id, body.model_dump(exclude_none=True), tenant_id=tenant_id
        )
        if updated is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Expense not found",
            )
        return updated
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense_by_id(
    expense_id: str,
    user: str = Depends(get_current_user),
    tenant_id: str = Depends(get_current_tenant),
):
    """Delete an expense by ID (must be owned by the current user)."""
    try:
        deleted = delete_expense(user, expense_id, tenant_id=tenant_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Expense not found",
            )
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
