from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
import json
import logging
import re
from typing import Any

import google.generativeai as genai
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError

from app.core.config import settings
from app.models.expense import ExpenseCreate

logger = logging.getLogger(__name__)

_ALLOWED_BILL_TYPES = {"grocery", "restaurant", "service", "utility", "other"}
_CODE_FENCE_PATTERN = re.compile(r"```(?:json)?|```", re.IGNORECASE)
_JSON_OBJECT_PATTERN = re.compile(r"\{[\s\S]*\}")
_MAX_OUTPUT_TOKENS = 512
_MAX_JSON_RETRIES = 2
_GEMINI_MODEL = "gemini-2.5-flash"
_gemini_models: dict[str, genai.GenerativeModel] = {}


class ExpenseExtractionValidationError(ValueError):
    """Raised when chat extraction is missing required fields."""

    def __init__(self, missing_fields: list[str]):
        self.missing_fields = missing_fields
        fields_text = ", ".join(missing_fields)
        super().__init__(
            "I couldn't confidently extract the "
            f"{fields_text}. Please include the merchant, amount, "
            "date, and what the expense was for."
        )


PROMPT_TEMPLATE = """
                Help me organize this purchase info.
                I need it in JSON format so I can track my spending.

                Here's the structure I need:
                {
                    "amount": the total amount paid only,
                    "category": what type of purchase,
                    "bill_type": one of:
                        grocery, restaurant, service, utility, or other,
                    "invoice_number": any receipt or transaction number,
                    "vendor": the store or business name,
                    "description": what was purchased short description,
                    "expense_date": the date in YYYY-MM-DD format,
                    "line_items": [
                        {
                            "name": item name,
                            "quantity": item quantity,
                            "price": item price
                        }
                    ]
                }

                Do not include tax fields.
                Just give me back the JSON.
                If you're not sure about a value,
                use 0 for numbers or empty string for text.
""".strip()

_JSON_REPAIR_TEMPLATE = """
    That output didn't quite work. Can you try again? Here's what I need:

{
  "amount": number,
  "category": string,
  "bill_type": "grocery" or "restaurant" or "service" or "utility" or "other",
  "invoice_number": string,
  "vendor": string,
  "description": string,
  "expense_date": "YYYY-MM-DD",
    "line_items": [
        {
            "name": string,
            "quantity": number,
            "price": number
        }
    ]
}

    Just the JSON, please.

Previous attempt:
__BAD_OUTPUT__
    """.strip()


def extract_expense_payload(
    text_input: str | None,
    image_bytes: bytes | None,
    image_mime_type: str | None,
) -> tuple[dict[str, Any], str]:
    """Extract and normalize expense payload from text and/or image."""
    if not text_input and not image_bytes:
        raise ValueError("Provide either text_input or an image")

    model_name = _resolve_model_name()
    model = _get_model(model_name)

    prompt_parts: list[Any] = [PROMPT_TEMPLATE]
    if text_input:
        prompt_parts.append(f"Source text:\n{text_input.strip()}")

    if image_bytes:
        if image_mime_type and not image_mime_type.startswith("image/"):
            raise ValueError("Only image uploads are supported")
        prompt_parts.append(_load_image(image_bytes))

    parsed = _generate_and_parse_json_with_retries(model, prompt_parts)
    normalized = _normalize_payload(parsed, text_input=text_input)

    logger.info(
        "Expense extraction completed successfully using model '%s'",
        model_name,
    )
    return normalized, model_name


def extract_text_chat_expense_payload(
    text_input: str,
) -> tuple[dict[str, Any], str]:
    """Extract a strict expense payload from plain text."""
    if not text_input or not text_input.strip():
        raise ValueError("message is required")

    model_name = _resolve_model_name()
    model = _get_model(model_name)
    prompt_parts: list[Any] = [
        PROMPT_TEMPLATE,
        f"Source text:\n{text_input.strip()}",
    ]

    parsed = _generate_and_parse_json_with_retries(model, prompt_parts)
    normalized = _normalize_text_chat_payload(parsed, text_input=text_input)

    logger.info(
        "Text chat expense extraction completed successfully using model '%s'",
        model_name,
    )
    return normalized, model_name


def _resolve_model_name() -> str:
    model_name = (settings.GEMINI_MODEL or "").strip()
    if not model_name:
        raise RuntimeError("GEMINI_MODEL is not configured")

    if model_name != _GEMINI_MODEL:
        raise RuntimeError(f"GEMINI_MODEL must be set to {_GEMINI_MODEL}")

    return model_name


def _get_model(model_name: str) -> genai.GenerativeModel:
    """Lazily initialize Gemini model with configured credentials."""
    cached = _gemini_models.get(model_name)
    if cached is not None:
        return cached

    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    genai.configure(api_key=settings.GEMINI_API_KEY)
    instance = genai.GenerativeModel(model_name)
    _gemini_models[model_name] = instance
    return instance


def _generate_and_parse_json_with_retries(
    model: genai.GenerativeModel,
    prompt_parts: list[Any],
) -> dict[str, Any]:
    """Generate JSON output and retry model-based repair up to max retries."""
    logger.info("Calling Gemini model for expense extraction")
    raw_text = _generate_model_text(model, prompt_parts)

    try:
        return _parse_json_from_model(raw_text)
    except (json.JSONDecodeError, RuntimeError) as first_error:
        logger.warning(
            "Initial model output was not valid JSON: %s",
            first_error,
        )

    latest_output = raw_text
    for retry_index in range(1, _MAX_JSON_RETRIES + 1):
        logger.info(
            "Retrying JSON extraction with model-based repair (%s/%s)",
            retry_index,
            _MAX_JSON_RETRIES,
        )
        latest_output = _generate_model_text(
            model,
            [
                _JSON_REPAIR_TEMPLATE.replace(
                    "__BAD_OUTPUT__",
                    latest_output,
                )
            ],
        )

        try:
            return _parse_json_from_model(latest_output)
        except (json.JSONDecodeError, RuntimeError) as retry_error:
            logger.warning(
                "JSON compatibility retry %s/%s failed: %s",
                retry_index,
                _MAX_JSON_RETRIES,
                retry_error,
            )

    raise RuntimeError("Could not obtain valid JSON from Gemini after 2 retries")


def _generate_model_text(
    model: genai.GenerativeModel,
    parts: list[Any],
) -> str:
    """Generate raw text from Gemini."""
    response = model.generate_content(parts)

    if response.candidates and response.candidates[0].finish_reason == 2:
        raise ValueError(
            "Gemini response was blocked/filtered. "
            "Try a clearer image or provide text_input instead."
        )

    raw_text = (getattr(response, "text", "") or "").strip()
    if not raw_text:
        finish_reason = (
            response.candidates[0].finish_reason if response.candidates else "N/A"
        )
        raise RuntimeError(
            "Gemini returned an empty response. " f"finish_reason: {finish_reason}"
        )
    return raw_text


def _load_image(image_bytes: bytes) -> Image.Image:
    """Load raw uploaded image bytes into a PIL image without preprocessing."""
    try:
        image = Image.open(BytesIO(image_bytes))
        image.load()
        return image
    except UnidentifiedImageError as exc:
        raise ValueError("Uploaded file is not a valid image") from exc


def _parse_json_from_model(raw_text: str) -> dict[str, Any]:
    """Extract JSON object from model output text."""
    cleaned = _CODE_FENCE_PATTERN.sub("", raw_text).strip()
    direct_candidate = cleaned

    if cleaned.startswith("{") and cleaned.endswith("}"):
        return json.loads(direct_candidate)

    match = _JSON_OBJECT_PATTERN.search(cleaned)
    if not match:
        logger.warning(f"No JSON object found in model output: {raw_text}")
        raise RuntimeError("Could not find a JSON object in model output")

    return json.loads(match.group(0))


def _normalize_payload(
    raw: dict[str, Any],
    text_input: str | None,
) -> dict[str, Any]:
    """Normalize model output into validated ExpenseCreate payload."""
    line_items = _normalize_line_items(raw.get("line_items") or raw.get("items") or [])

    amount = _to_float(raw.get("amount"))
    if amount is None:
        amount = _to_float(raw.get("total"))
    if (amount is None or amount <= 0) and line_items:
        amount = round(sum(item["total"] for item in line_items), 2)
    if amount is None or amount <= 0:
        raise RuntimeError("Could not extract a valid expense amount")

    category = str(raw.get("category") or "other").strip().lower()
    if len(category) < 2:
        category = "other"

    bill_type = str(raw.get("bill_type") or "other").strip().lower()
    if bill_type not in _ALLOWED_BILL_TYPES:
        bill_type = "other"

    vendor = str(raw.get("vendor") or "").strip()[:128]
    description = str(raw.get("description") or "").strip()
    if not description and text_input:
        description = text_input.strip()[:255]
    description = description[:255]

    invoice_number = _normalize_invoice_number(
        raw,
        text_input=text_input,
        description=description,
    )

    expense_date = _normalize_date(raw.get("expense_date") or raw.get("date"))

    payload = {
        "amount": round(amount, 2),
        "category": category,
        "bill_type": bill_type,
        "invoice_number": invoice_number,
        "vendor": vendor,
        "description": description,
        "expense_date": expense_date.isoformat(),
        "line_items": line_items,
    }

    try:
        # Validate final payload against API schema constraints.
        return ExpenseCreate(**payload).model_dump(mode="json")
    except ValidationError as exc:
        raise RuntimeError("Extracted data failed validation") from exc


def _normalize_text_chat_payload(
    raw: dict[str, Any],
    text_input: str,
) -> dict[str, Any]:
    amount = _to_float(raw.get("amount"))
    if amount is None:
        amount = _to_float(raw.get("total"))

    vendor = str(raw.get("vendor") or raw.get("merchant") or "").strip()[:128]
    description = str(raw.get("description") or raw.get("purpose") or "").strip()[:255]
    expense_date = _normalize_date(
        raw.get("expense_date") or raw.get("date"),
        default_to_today=False,
    )

    missing_fields: list[str] = []
    if amount is None or amount <= 0:
        missing_fields.append("amount")
    if not vendor:
        missing_fields.append("vendor")
    if expense_date is None:
        missing_fields.append("expense date")
    if not description:
        missing_fields.append("description")

    if missing_fields:
        raise ExpenseExtractionValidationError(missing_fields)

    category = str(raw.get("category") or "other").strip().lower()
    if len(category) < 2:
        category = "other"

    bill_type = str(raw.get("bill_type") or "other").strip().lower()
    if bill_type not in _ALLOWED_BILL_TYPES:
        bill_type = "other"

    payload = {
        "amount": round(amount, 2),
        "category": category,
        "bill_type": bill_type,
        "invoice_number": _normalize_invoice_number(
            raw,
            text_input=text_input,
            description=description,
        ),
        "vendor": vendor,
        "description": description,
        "expense_date": expense_date.isoformat(),
        "line_items": [],
    }

    try:
        return ExpenseCreate(**payload).model_dump(mode="json")
    except ValidationError as exc:
        raise RuntimeError("Extracted data failed validation") from exc


def _normalize_line_items(raw_items: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_items, list):
        return []

    normalized: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue

        name = str(item.get("name") or "item").strip()[:128]
        quantity = _to_float(item.get("quantity")) or 1.0
        unit_price = _to_float(item.get("unit_price"))
        if unit_price is None:
            unit_price = _to_float(item.get("price"))

        total = _to_float(item.get("total"))
        if total is None and unit_price is not None:
            total = quantity * unit_price

        invalid_row = (
            quantity <= 0
            or (unit_price is not None and unit_price <= 0)
            or total is None
            or total <= 0
        )
        if invalid_row:
            continue

        if unit_price is None:
            unit_price = total / quantity

        normalized.append(
            {
                "name": name or "item",
                "quantity": round(quantity, 3),
                "unit_price": round(unit_price, 2),
                "total": round(total, 2),
            }
        )

    return normalized


def _normalize_date(value: Any, default_to_today: bool = True) -> date | None:
    if not value:
        return date.today() if default_to_today else None

    raw = str(value).strip()
    if not raw:
        return date.today() if default_to_today else None

    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        try:
            return datetime.fromisoformat(raw).date()
        except ValueError:
            return date.today() if default_to_today else None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return None

    text = re.sub(r"[^0-9.\-]", "", text)
    if not text:
        return None

    try:
        return float(text)
    except ValueError:
        return None


def _normalize_invoice_number(
    raw: dict[str, Any],
    text_input: str | None,
    description: str,
) -> str:
    invoice_keys = [
        "invoice_number",
        "invoice_no",
        "invoice",
        "bill_number",
        "bill_no",
        "receipt_number",
        "receipt_no",
    ]

    value = ""
    for key in invoice_keys:
        candidate = raw.get(key)
        if candidate:
            value = str(candidate)
            break

    cleaned = re.sub(r"\s+", " ", value).strip()
    cleaned = re.sub(r"[^A-Za-z0-9\-/]", "", cleaned)

    if cleaned:
        return cleaned[:64]

    fallback_text = " ".join(part for part in [text_input or "", description] if part)
    if not fallback_text:
        return ""

    patterns = [
        (
            r"(?:invoice|inv|bill|receipt)\s*(?:no|number|#|:)?\s*"
            r"([A-Za-z0-9\-/]{3,64})"
        ),
        r"\b([A-Za-z]{2,6}[-/][A-Za-z0-9\-/]{2,58})\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, fallback_text, flags=re.IGNORECASE)
        if not match:
            continue

        candidate = re.sub(r"[^A-Za-z0-9\-/]", "", match.group(1)).strip()
        if candidate:
            return candidate[:64]

    return ""
