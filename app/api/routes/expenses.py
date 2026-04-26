from datetime import date
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
import logging
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.models.expense import (
    ExpenseChatCreateRequest,
    ExpenseCreate,
    ExpenseInputType,
)
from app.services.expense_service import (
    add_expense,
    category_summary,
    categories_monthly_summary,
    check_session_expense_limit,
    daily_summary,
    get_expense_limit_status,
    list_expenses,
    monthly_summary,
    vendors_monthly_summary,
    yearly_summary,
    SessionExpenseLimitError,
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

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("", status_code=201)
def create_expense(
    payload: ExpenseCreate,
    user: str = Depends(get_current_user),
):
    """Create a new expense"""
    logger.info("Create expense request received")
    try:
        check_session_expense_limit(user)
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
        )
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
):
    """Extract expense details with Gemini and insert into DB."""
    logger.info("Extract-and-create expense request received")
    try:
        # Enforce limit before reading image bytes or calling Gemini.
        check_session_expense_limit(user)
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
        )

        logger.info("Expense extracted and created successfully")
        return {
            "expense": result,
            "extracted": extracted,
            "llm_model": used_llm_model,
        }
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
):
    """Extract expense fields from free-form text and create the expense."""
    logger.info("Chat expense create request received")
    try:
        if looks_like_expense_analysis_request(payload.message):
            logger.info("Handling chat request as expense analysis query")
            return await run_in_threadpool(
                answer_expense_analysis_query,
                username=user,
                message=payload.message,
            )

        check_session_expense_limit(user)
        extracted, used_llm_model = await run_in_threadpool(
            extract_text_chat_expense_payload,
            payload.message,
        )

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
        )

        logger.info("Expense created successfully from chat")
        return {
            "expense": result,
            "extracted": extracted,
            "llm_model": used_llm_model,
            "message": (
                f"Saved {result['vendor']} for {result['amount']:.2f} "
                f"on {result['expense_date']}."
            ),
        }
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
def get_expenses(user: str = Depends(get_current_user)):
    """Get all expenses for the current user"""
    logger.info("Get expenses request received")
    try:
        result = {"items": list_expenses(user)}
        logger.info(f"Retrieved {len(result['items'])} expenses")
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
def get_expense_limit_status_route(user: str = Depends(get_current_user)):
    """Get expense-limit status for the current user."""
    logger.info("Expense limit status request received")
    try:
        result = get_expense_limit_status(user)
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
):
    """Get monthly expense summary"""
    logger.info(f"Monthly summary request for year: {year}")
    try:
        result = {"items": monthly_summary(user, year)}
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
def get_yearly_summary(user: str = Depends(get_current_user)):
    """Get yearly expense summary"""
    logger.info("Yearly summary request received")
    try:
        result = {"items": yearly_summary(user)}
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
):
    """Get category-wise expense summary"""
    logger.info(f"Category summary request (year={year}, month={month})")
    try:
        result = {"items": category_summary(user, year=year, month=month)}
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
):
    """Get daily expense totals for a given year and month"""
    logger.info(f"Daily summary request for {year}-{month}")
    try:
        result = {"items": daily_summary(user, year, month)}
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
):
    """Get category breakdown for a given year and month"""
    logger.info(f"Categories monthly summary request for {year}-{month}")
    try:
        result = {"items": categories_monthly_summary(user, year, month)}
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
):
    """Get vendor breakdown for a given year and month"""
    logger.info(f"Vendors monthly summary request for {year}-{month}")
    try:
        result = {"items": vendors_monthly_summary(user, year, month)}
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
