"""
Narrative and highlight generation for agent answers.

Template-driven by default rather than model-driven, for two reasons: it costs
nothing and adds no latency, and — more importantly — every number it states
is computed from the query result.

This replaces the client-side `analyzeComplexQuery()` in InsightsPage.jsx,
which fabricated its figures: forecasts were `total * 1.085`, growth used the
literal multipliers [1.05, 1.03, 1.12, 1.0], and "you could save 15%" was a
constant. Nothing here invents a value. Where a projection genuinely cannot be
computed from the data, it is not offered at all.
"""

from __future__ import annotations

from typing import Any

# Indian digit grouping (1,23,456) matches the frontend's en-IN formatter.
def format_inr(value: Any) -> str:
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        return "₹0"

    negative = amount < 0
    whole = int(abs(amount))
    fraction = abs(amount) - whole

    digits = str(whole)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        grouped = ",".join(groups + [tail])
    else:
        grouped = digits

    text = f"₹{grouped}"
    if fraction >= 0.005:
        text = f"₹{grouped}.{int(round(fraction * 100)):02d}"
    return f"-{text}" if negative else text


def _pct_change(current: float, previous: float) -> float | None:
    """Percentage change, or None when there is no meaningful baseline."""
    if previous == 0:
        return None
    return ((current - previous) / abs(previous)) * 100.0


def _sum(rows: list[dict], key: str) -> float:
    total = 0.0
    for row in rows:
        value = row.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            total += float(value)
    return total


def _label_of(row: dict, key: str) -> str:
    value = row.get(key)
    if value is None or value == "":
        return "Unknown"
    return str(value)


def build_narrative(
    rows: list[dict],
    visual: dict,
    *,
    question: str,
    explain: str = "",
) -> dict:
    """
    Produce `{headline, body_md, highlights[]}` from a result set.

    Every figure is derived from `rows`. When the data does not support a
    statement, the statement is omitted rather than estimated.
    """
    encoding = visual.get("encoding") or {}
    chart = visual.get("chart")

    measure = encoding.get("value") or ""
    label_key = encoding.get("name") or encoding.get("x") or ""

    if not rows:
        return {
            "headline": "No matching expenses",
            "body_md": (
                "Nothing matched this question. Try widening the date range, "
                "or check whether the category or vendor name is spelled the "
                "way it appears on your expenses."
            ),
            "highlights": [],
        }

    highlights: list[dict] = []
    lines: list[str] = []

    # --- Single value ----------------------------------------------------
    if chart == "kpi" and measure:
        value = rows[0].get(measure)
        headline = f"{format_inr(value)} in total"
        highlights.append({
            "label": _title(measure),
            "value": value,
            "format": "currency",
        })
        if explain:
            lines.append(explain)
        return {"headline": headline, "body_md": "\n\n".join(lines), "highlights": highlights}

    # --- Ranked categorical ---------------------------------------------
    if chart == "breakdown" and measure and label_key:
        total = _sum(rows, measure)
        top = rows[0]
        top_label = _label_of(top, label_key)
        top_value = float(top.get(measure) or 0)
        share = (top_value / total * 100.0) if total > 0 else 0.0

        headline = f"{top_label} leads at {format_inr(top_value)}"

        highlights.append({"label": "Total", "value": total, "format": "currency"})
        highlights.append({
            "label": f"Top: {top_label}",
            "value": top_value,
            "format": "currency",
            "delta_pct": round(share, 1),
            "direction": "flat",
            "tone": "info",
        })
        highlights.append({
            "label": "Distinct entries",
            "value": len(rows),
            "format": "number",
        })

        lines.append(
            f"Across **{len(rows)}** entries totalling **{format_inr(total)}**, "
            f"**{top_label}** accounts for **{share:.1f}%**."
        )

        if len(rows) >= 3:
            runners = ", ".join(
                f"{_label_of(r, label_key)} ({format_inr(r.get(measure))})"
                for r in rows[1:3]
            )
            lines.append(f"Next highest: {runners}.")

        # Concentration is a real, computable observation — unlike a forecast.
        top_three = _sum(rows[:3], measure)
        if total > 0 and len(rows) > 3:
            concentration = top_three / total * 100.0
            lines.append(
                f"The top 3 make up **{concentration:.0f}%** of the total."
            )

        return {"headline": headline, "body_md": "\n\n".join(lines), "highlights": highlights}

    # --- Time series -----------------------------------------------------
    if chart == "trend_bar" and measure:
        total = _sum(rows, measure)
        values = [
            float(r.get(measure) or 0)
            for r in rows
            if isinstance(r.get(measure), (int, float))
        ]
        non_zero = [v for v in values if v > 0]
        average = (sum(non_zero) / len(non_zero)) if non_zero else 0.0

        peak_row = max(rows, key=lambda r: float(r.get(measure) or 0))
        peak_label = _label_of(peak_row, label_key) if label_key else ""
        peak_value = float(peak_row.get(measure) or 0)

        headline = f"{format_inr(total)} across {len(rows)} periods"

        highlights.append({"label": "Total", "value": total, "format": "currency"})
        highlights.append({"label": "Average", "value": round(average, 2), "format": "currency"})
        highlights.append({
            "label": f"Peak{f': {peak_label}' if peak_label else ''}",
            "value": peak_value,
            "format": "currency",
        })

        lines.append(
            f"Total **{format_inr(total)}**, averaging **{format_inr(average)}** "
            f"per active period."
        )
        if peak_label:
            lines.append(f"Highest was **{peak_label}** at **{format_inr(peak_value)}**.")

        # First-vs-last is an actual measured change, stated as such — not a
        # projection.
        if len(non_zero) >= 2:
            first, last = values[0], values[-1]
            change = _pct_change(last, first)
            if change is not None and abs(change) >= 1:
                direction = "up" if change > 0 else "down"
                lines.append(
                    f"From first to last period, spending moved "
                    f"**{direction} {abs(change):.0f}%** "
                    f"({format_inr(first)} → {format_inr(last)})."
                )
                highlights.append({
                    "label": "Change",
                    "value": last,
                    "format": "currency",
                    "delta_pct": round(abs(change), 1),
                    "direction": direction,
                    "tone": "warn" if direction == "up" else "good",
                })

        return {"headline": headline, "body_md": "\n\n".join(lines), "highlights": highlights}

    # --- Multi-series ----------------------------------------------------
    if chart == "category_trend" and measure:
        total = _sum(rows, measure)
        headline = f"{format_inr(total)} across {len(rows)} rows"
        highlights.append({"label": "Total", "value": total, "format": "currency"})
        highlights.append({"label": "Rows", "value": len(rows), "format": "number"})
        lines.append(
            f"Grouped comparison over **{len(rows)}** rows totalling "
            f"**{format_inr(total)}**."
        )
        return {"headline": headline, "body_md": "\n\n".join(lines), "highlights": highlights}

    # --- Fallback: table -------------------------------------------------
    headline = f"{len(rows)} result{'s' if len(rows) != 1 else ''}"
    if measure:
        total = _sum(rows, measure)
        highlights.append({"label": "Total", "value": total, "format": "currency"})
        headline = f"{len(rows)} results · {format_inr(total)}"
    if explain:
        lines.append(explain)

    return {"headline": headline, "body_md": "\n\n".join(lines), "highlights": highlights}


def _title(key: str) -> str:
    return key.replace("_", " ").strip().title()


def build_followups(visual: dict, rows: list[dict]) -> list[str]:
    """Suggest next questions based on what was just shown."""
    chart = visual.get("chart")
    encoding = visual.get("encoding") or {}
    label_key = encoding.get("name") or encoding.get("x") or ""

    suggestions: list[str] = []

    if chart == "breakdown":
        if label_key == "category":
            suggestions.append("Break this down by vendor")
        elif label_key == "vendor":
            suggestions.append("Break this down by category")
        suggestions.append("How does this compare to last month?")
        if rows:
            top = _label_of(rows[0], label_key) if label_key else ""
            if top and top != "Unknown":
                suggestions.append(f"Show only {top} expenses")

    elif chart == "trend_bar":
        suggestions.append("Which category drove the change?")
        suggestions.append("Show my top vendors for this period")

    elif chart == "kpi":
        suggestions.append("Break that down by category")
        suggestions.append("How does it compare to last month?")

    else:
        suggestions.append("Summarise this by category")
        suggestions.append("Show the monthly trend")

    # Dedupe, preserve order, cap at 3.
    seen: set[str] = set()
    unique = []
    for item in suggestions:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique[:3]
