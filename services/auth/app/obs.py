"""Observabilité partagée : logs JSON (pour Loki/Promtail) + métriques Prometheus.

Ce module est identique dans chaque service : chaque microservice se build dans son
propre contexte Docker, on duplique donc volontairement ce petit fichier plutôt que de
créer un couplage entre services. C'est un choix assumé (isolation > DRY ici).
"""
import json
import logging
import sys
import time

from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


# --- Logs structurés JSON sur stdout ---------------------------------------
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "service": getattr(record, "service", "unknown"),
            "msg": record.getMessage(),
        }
        # Champs additionnels passés via logger.info(..., extra={"extra_fields": {...}})
        if hasattr(record, "extra_fields"):
            payload.update(record.extra_fields)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(service_name: str, level: str = "INFO") -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    logger = logging.getLogger(service_name)
    logger = logging.LoggerAdapter(logger, {"service": service_name})  # type: ignore
    # On renvoie un logger simple avec service attaché via filtre
    base = logging.getLogger(service_name)

    class _ServiceFilter(logging.Filter):
        def filter(self, record):
            record.service = service_name
            return True

    base.addFilter(_ServiceFilter())
    return base


# --- Métriques Prometheus ---------------------------------------------------
REQUEST_COUNT = Counter(
    "http_requests_total", "Nombre de requêtes HTTP",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds", "Latence des requêtes HTTP (s)",
    ["method", "path"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path in ("/metrics", "/health"):
            return await call_next(request)
        start = time.perf_counter()
        # On agrège par route (template) pour éviter l'explosion de cardinalité.
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            REQUEST_COUNT.labels(request.method, path, "500").inc()
            REQUEST_LATENCY.labels(request.method, path).observe(time.perf_counter() - start)
            raise
        REQUEST_COUNT.labels(request.method, path, str(status)).inc()
        REQUEST_LATENCY.labels(request.method, path).observe(time.perf_counter() - start)
        return response


def metrics_response() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
