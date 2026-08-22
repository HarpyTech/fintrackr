"""
Turn executed query results into a render-ready visual spec.

Deterministic on purpose. Choosing a chart from a result shape is a decision
with a right answer, so it is made in code rather than by a second model call:
faster, free, and it cannot hallucinate a field name that is not in the rows.
The author sub-agent's `chart_hint` is treated as a suggestion and overridden
whenever the actual data disagrees with it.

What this emits and what it deliberately does NOT emit:

  emits   — chart kind, which result field fills which visual role, a title,
            a coarse size, and the rows themselves
  omits   — colours, tick counts, slice caps, radii, font sizes

Everything omitted depends on viewport width or the active theme, which the
server cannot observe. The client keeps those with useChartLayout() and
useChartTheme(), so a 320px phone still gets 5 donut slices and 4 axis ticks
while the desktop gets 7 and 6, and dark mode axis colours stay correct.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

from app.models.mongo_query import ChartHint

logger = logging.getLogger(__name__)

# Chart kinds the frontend CHART_REGISTRY can render.
_VALID_CHARTS = {"trend_bar", "breakdown", "category_trend", "table", "kpi"}

# Result keys that represent a point in time rather than a category. A grouping
# key from this set means the data is a series and should trend, not a donut.
_TEMPORAL_KEYS = {
    "day", "week", "month", "year", "date", "expense_date",
    "_id", "period", "day_of_week", "weekday", "hour",
}

# Keys that are measures rather than labels.
_MEASURE_KEYS = {
    "total", "amount", "sum", "avg", "average", "count", "min", "max",
    "quantity", "unit_price", "value",
}

_MAX_TABLE_COLUMNS = 8


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_temporal(value: Any) -> bool:
    return isinstance(value, (date, datetime))


def _column_type(key: str, values: list[Any]) -> str:
    """Infer a column type for the frontend's formatting decisions."""
    sample = next((v for v in values if v is not None), None)

    if _is_temporal(sample):
        return "date"
    if _is_number(sample):
        # Money vs plain count matters for formatting (₹1.2K vs 1200).
        if key in {"count", "line_items_count", "quantity", "transactions"}:
            return "number"
        if key in _MEASURE_KEYS or "amount" in key or "total" in key:
            return "currency"
        return "number"
    return "string"


def describe_columns(rows: list[dict]) -> list[dict]:
    """Build column metadata from result rows, preserving first-seen order."""
    if not rows:
        return []

    ordered: list[str] = []
    for row in rows:
        for key in row:
            if key not in ordered:
                ordered.append(key)

    columns = []
    for key in ordered[:_MAX_TABLE_COLUMNS]:
        values = [row.get(key) for row in rows]
        columns.append({
            "key": key,
            "label": _humanize(key),
            "type": _column_type(key, values),
        })
    return columns


def _humanize(key: str) -> str:
    if key == "_id":
        return "Group"
    return key.replace("_", " ").strip().title()


def _classify(rows: list[dict], columns: list[dict]) -> tuple[list[str], list[str]]:
    """Split columns into (label keys, measure keys)."""
    labels: list[str] = []
    measures: list[str] = []

    for column in columns:
        key, ctype = column["key"], column["type"]
        if ctype in {"currency", "number"} and key not in _TEMPORAL_KEYS:
            measures.append(key)
        else:
            labels.append(key)

    # A numeric grouping key (month=1..12, year=2026) is a label, not a measure.
    for key in list(measures):
        if key in _TEMPORAL_KEYS:
            measures.remove(key)
            labels.append(key)

    return labels, measures


def build_visual(
    rows: list[dict],
    hint: ChartHint,
    *,
    dataset_id: str,
    visual_id: str = "v1",
    fallback_title: str = "Result",
) -> dict:
    """
    Derive the visual spec for a result set.

    The hint is honoured only when the data can actually support it.
    """
    columns = describe_columns(rows)
    title = (hint.title or fallback_title).strip()[:80]

    if not rows or not columns:
        return {
            "id": visual_id,
            "dataset_id": dataset_id,
            "title": title,
            "chart": "table",
            "encoding": {},
            "size": "sm",
            "color": "accent",
        }

    labels, measures = _classify(rows, columns)

    # A single row with a single measure is a headline number, not a chart.
    if len(rows) == 1 and len(measures) >= 1 and len(labels) == 0:
        return {
            "id": visual_id,
            "dataset_id": dataset_id,
            "title": title,
            "chart": "kpi",
            "encoding": {"value": measures[0]},
            "size": "sm",
            "color": "accent",
        }

    # No measure to plot — nothing to do but list it.
    if not measures:
        return _table(visual_id, dataset_id, title)

    label_key = labels[0] if labels else columns[0]["key"]
    measure_key = measures[0]

    temporal = label_key in _TEMPORAL_KEYS or any(
        c["key"] == label_key and c["type"] == "date" for c in columns
    )

    # Two label dimensions + a measure is a multi-series chart.
    if len(labels) >= 2 and len(rows) > 1:
        chart = "category_trend"
        encoding = {
            "x": labels[0],
            "series": labels[1],
            "value": measure_key,
            "x_label": _humanize(labels[0]),
        }
        return _spec(visual_id, dataset_id, title, chart, encoding, "lg")

    requested = hint.chart if hint.chart in _VALID_CHARTS else None

    if temporal:
        # Time series always trends; a donut over months is meaningless.
        chart = "trend_bar"
        if requested == "table":
            chart = "table"
    else:
        # Categorical: a donut communicates share, a bar communicates ranking.
        # Honour the hint between those two, else pick by cardinality.
        if requested in {"breakdown", "trend_bar", "table"}:
            chart = requested
        else:
            chart = "breakdown" if len(rows) <= 12 else "trend_bar"

    if chart == "table":
        return _table(visual_id, dataset_id, title)

    if chart == "breakdown":
        encoding = {"name": label_key, "value": measure_key}
        size = "md"
    else:
        encoding = {
            "x": label_key,
            "value": measure_key,
            "x_label": _humanize(label_key),
        }
        size = "md" if len(rows) <= 20 else "lg"

    color = "accent_alt" if measure_key in {"count", "transactions"} else "accent"
    return _spec(visual_id, dataset_id, title, chart, encoding, size, color)


def _spec(visual_id, dataset_id, title, chart, encoding, size, color="accent") -> dict:
    return {
        "id": visual_id,
        "dataset_id": dataset_id,
        "title": title,
        "chart": chart,
        "encoding": encoding,
        "size": size,
        "color": color,
    }


def _table(visual_id, dataset_id, title) -> dict:
    return _spec(visual_id, dataset_id, title, "table", {}, "md")


def build_dataset(
    rows: list[dict],
    *,
    dataset_id: str = "ds_1",
    title: str = "Result",
    truncated: bool = False,
) -> dict:
    """Package rows plus column metadata for the client."""
    return {
        "id": dataset_id,
        "title": title,
        "columns": describe_columns(rows),
        "rows": rows,
        "row_count": len(rows),
        "truncated": truncated,
    }
