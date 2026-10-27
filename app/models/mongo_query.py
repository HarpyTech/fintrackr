"""
Models for LLM-authored MongoDB queries.

The query-author sub-agent emits a `MongoQueryEnvelope` rather than a bare
pipeline, so the guard (app/services/mongo_guard.py) always has a stable,
typed shape to validate before anything reaches the database.

IMPORTANT: these models do NOT make a query safe. They only constrain the
outer envelope — `pipeline` and `filter` are free-form dicts because Mongo
syntax cannot be expressed as a fixed Pydantic schema. All safety comes from
the recursive allow-list walk in mongo_guard.validate_envelope(). Never
execute an envelope that has not passed through the guard.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Collections the analytics agent may ever touch. `users`, `refresh_tokens`,
# `webauthn_credentials` and the OTP collections are deliberately absent.
AnalyticsCollection = Literal["expenses", "expense_line_items"]

QueryOp = Literal["aggregate", "find"]

# Chart kinds the frontend registry knows how to render.
ChartKind = Literal["trend_bar", "breakdown", "category_trend", "table", "kpi"]

ChartSize = Literal["sm", "md", "lg"]


class ChartEncoding(BaseModel):
    """
    Which result fields map to which visual roles.

    Deliberately field NAMES only — no colours, tick counts, radii or pixel
    sizes. Those depend on viewport and theme, which the server cannot
    observe, and stay with useChartLayout()/useChartTheme() on the client.
    """

    model_config = ConfigDict(extra="forbid")

    x: str = Field("", max_length=64)
    value: str = Field("", max_length=64)
    series: str = Field("", max_length=64)
    name: str = Field("", max_length=64)
    x_label: str = Field("", max_length=48)


class ChartHint(BaseModel):
    """
    The author sub-agent's suggestion for how to visualise the result.

    Advisory only. `chart_builder` re-derives the chart from the actual
    result shape and overrides this when it disagrees, so a bad hint
    degrades presentation rather than breaking the answer.
    """

    model_config = ConfigDict(extra="forbid")

    chart: ChartKind = "table"
    encoding: ChartEncoding = Field(
        default_factory=lambda: ChartEncoding(
            x="",
            value="",
            series="",
            name="",
            x_label="",
        )
    )
    title: str = Field("", max_length=80)
    size: ChartSize = "md"


class MongoQueryEnvelope(BaseModel):
    """A single query the agent wants to run, before validation."""

    model_config = ConfigDict(extra="forbid")

    op: QueryOp = "aggregate"
    collection: AnalyticsCollection = "expenses"

    # Free-form by necessity; the guard validates every key recursively.
    pipeline: list[dict] = Field(default_factory=list)
    filter: dict = Field(default_factory=dict)
    projection: dict = Field(default_factory=dict)
    sort: dict = Field(default_factory=dict)

    limit: int = Field(50, ge=1, le=200)

    chart_hint: ChartHint = Field(
        default_factory=lambda: ChartHint(
            chart="table",
            encoding=ChartEncoding(
                x="",
                value="",
                series="",
                name="",
                x_label="",
            ),
            title="",
            size="md",
        )
    )

    # Plain-language description of what the query does, surfaced verbatim in
    # the transparency panel.
    explain: str = Field("", max_length=280)

    confidence: float = Field(0.0, ge=0.0, le=1.0)
    assumptions: list[str] = Field(default_factory=list, max_length=6)

    # Non-empty when the question is too ambiguous to answer; the orchestrator
    # returns this instead of touching the database.
    clarification: str = Field("", max_length=280)


class MongoQueryEnvelopeLLM(BaseModel):
    """
    Flattened variant handed to Gemini as a `response_schema`.

    google-generativeai 0.8.5 does not handle `anyOf`/optional unions in
    response schemas, so every field here is required and non-optional, with
    "" / 0 / [] acting as sentinels. `to_envelope()` adapts back to the real
    model, which is what the guard sees.

    `pipeline_json`, `filter_json`, `projection_json` and `sort_json` are
    strings rather than objects because the schema translator cannot express
    "arbitrary JSON object" either. They are parsed here, and a parse failure
    is treated exactly like a validation failure — one repair attempt, then
    fallback.
    """

    model_config = ConfigDict(extra="forbid")

    op: QueryOp
    collection: AnalyticsCollection
    pipeline_json: str
    filter_json: str
    projection_json: str
    sort_json: str
    limit: int
    chart: ChartKind
    encoding_x: str
    encoding_value: str
    encoding_series: str
    encoding_name: str
    encoding_x_label: str
    chart_title: str
    chart_size: ChartSize
    explain: str
    confidence: float
    assumptions: list[str]
    clarification: str

    def to_envelope(self) -> MongoQueryEnvelope:
        """
        Adapt to the real envelope.

        Raises ValueError on malformed JSON or a wrong top-level JSON type, so
        the caller can treat it identically to a guard rejection.
        """
        import json

        def _obj(raw: str, field: str) -> dict:
            text = (raw or "").strip()
            if not text or text in {"{}", "null"}:
                return {}
            try:
                parsed = json.loads(text)
            except (ValueError, TypeError) as exc:
                raise ValueError(f"{field} is not valid JSON: {exc}") from exc
            if not isinstance(parsed, dict):
                raise ValueError(f"{field} must be a JSON object")
            return parsed

        def _arr(raw: str, field: str) -> list:
            text = (raw or "").strip()
            if not text or text in {"[]", "null"}:
                return []
            try:
                parsed = json.loads(text)
            except (ValueError, TypeError) as exc:
                raise ValueError(f"{field} is not valid JSON: {exc}") from exc
            if not isinstance(parsed, list):
                raise ValueError(f"{field} must be a JSON array")
            return parsed

        return MongoQueryEnvelope(
            op=self.op,
            collection=self.collection,
            pipeline=_arr(self.pipeline_json, "pipeline"),
            filter=_obj(self.filter_json, "filter"),
            projection=_obj(self.projection_json, "projection"),
            sort=_obj(self.sort_json, "sort"),
            # Clamp rather than reject: an over-eager limit is not a safety
            # problem, and the guard caps it again anyway.
            limit=max(1, min(int(self.limit or 50), 200)),
            chart_hint=ChartHint(
                chart=self.chart,
                encoding=ChartEncoding(
                    x=self.encoding_x[:64],
                    value=self.encoding_value[:64],
                    series=self.encoding_series[:64],
                    name=self.encoding_name[:64],
                    x_label=self.encoding_x_label[:48],
                ),
                title=self.chart_title[:80],
                size=self.chart_size,
            ),
            explain=self.explain[:280],
            confidence=max(0.0, min(float(self.confidence or 0.0), 1.0)),
            assumptions=[a[:160] for a in (self.assumptions or [])][:6],
            clarification=self.clarification[:280],
        )
