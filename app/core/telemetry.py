"""OpenTelemetry SDK setup for FinTrackr.

Configures OTLP export over HTTP when OTEL_EXPORTER_OTLP_ENDPOINT is set.
When the env var is empty (default), this module is a no-op so the app runs
without any OTel dependency in development or testing environments.

Instruments:
- FastAPI (trace every HTTP request)
- PyMongo (trace every DB operation)

Keeps the existing X-Trace-ID propagation system in place — OTel is additive.
"""
import logging

logger = logging.getLogger(__name__)


def setup_telemetry(app) -> None:
    """Wire OTel SDK into the running FastAPI app.

    Called once from the lifespan startup handler. Silently returns if
    OTEL_EXPORTER_OTLP_ENDPOINT is not configured so tests and local dev
    don't require the optional packages.
    """
    from app.core.config import settings

    if not settings.OTEL_EXPORTER_OTLP_ENDPOINT:
        logger.debug("OTEL_EXPORTER_OTLP_ENDPOINT not set — OpenTelemetry disabled")
        return

    try:
        from opentelemetry import metrics, trace
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.pymongo import PymongoInstrumentor
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning(
            "OpenTelemetry packages not installed — skipping OTel setup. "
            "Add opentelemetry-sdk, opentelemetry-exporter-otlp-proto-http, "
            "opentelemetry-instrumentation-fastapi, and "
            "opentelemetry-instrumentation-pymongo to requirements.txt."
        )
        return

    endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT.rstrip("/")
    resource = Resource.create({"service.name": settings.PROJECT_NAME})

    # --- Traces ---
    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces")
        )
    )
    trace.set_tracer_provider(tracer_provider)

    # --- Metrics ---
    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[
            PeriodicExportingMetricReader(
                OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics")
            )
        ],
    )
    metrics.set_meter_provider(meter_provider)

    # --- Instrumentation ---
    FastAPIInstrumentor.instrument_app(app)
    PymongoInstrumentor().instrument()

    logger.info("OpenTelemetry configured — exporting to %s", endpoint)
