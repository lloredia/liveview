"""
Verifier metrics: latency, mismatch rate, dispute count, correction count, rate limit hits.
Exposes HTTP endpoint for scraping (Prometheus-style or simple JSON).
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Dict

from shared.utils.logging import get_logger

logger = get_logger(__name__)

# In-memory counters (reset on restart)
_metrics: Dict[str, Any] = {
    "verification_latency_seconds": [],
    "mismatch_count": 0,
    "dispute_count": 0,
    "correction_count": 0,
    "rate_limit_hits": 0,
    "external_fetch_latency_seconds": {},
}
_lock = asyncio.Lock()


def record_verification_latency(seconds: float) -> None:
    _metrics["verification_latency_seconds"].append(seconds)
    if len(_metrics["verification_latency_seconds"]) > 1000:
        _metrics["verification_latency_seconds"] = _metrics["verification_latency_seconds"][-500:]


def record_mismatch() -> None:
    _metrics["mismatch_count"] += 1


def record_dispute() -> None:
    _metrics["dispute_count"] += 1


def record_correction() -> None:
    _metrics["correction_count"] += 1


def record_rate_limit_hit() -> None:
    _metrics["rate_limit_hits"] += 1


def record_external_fetch_latency(domain: str, seconds: float) -> None:
    if domain not in _metrics["external_fetch_latency_seconds"]:
        _metrics["external_fetch_latency_seconds"][domain] = []
    _metrics["external_fetch_latency_seconds"][domain].append(seconds)
    if len(_metrics["external_fetch_latency_seconds"][domain]) > 200:
        _metrics["external_fetch_latency_seconds"][domain] = _metrics["external_fetch_latency_seconds"][domain][-100:]


def get_metrics() -> Dict[str, Any]:
    lat = _metrics["verification_latency_seconds"]
    avg_lat = sum(lat) / len(lat) if lat else 0
    return {
        "verification_latency_avg_seconds": round(avg_lat, 4),
        "verification_latency_samples": len(lat),
        "mismatch_count": _metrics["mismatch_count"],
        "dispute_count": _metrics["dispute_count"],
        "correction_count": _metrics["correction_count"],
        "rate_limit_hits": _metrics["rate_limit_hits"],
        "external_fetch_latency_by_domain": {
            k: round(sum(v) / len(v), 4) if v else 0
            for k, v in _metrics["external_fetch_latency_seconds"].items()
        },
    }


def _run_metrics_server(port: int) -> None:
    """Run blocking HTTP server in a thread; GET /metrics returns JSON, GET /health returns ok."""
    import json
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/metrics":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(get_metrics()).encode())
            elif self.path == "/health":
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"ok")
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            pass

    server = HTTPServer(("0.0.0.0", port), Handler)
    server.serve_forever()


async def metrics_http_server(port: int) -> None:
    """Start metrics HTTP server in a thread (non-blocking)."""
    import threading
    thread = threading.Thread(target=_run_metrics_server, args=(port,), daemon=True)
    thread.start()
    logger.info("metrics_server_started", port=port)
