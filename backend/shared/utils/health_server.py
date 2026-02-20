"""
Minimal HTTP server for worker services (ingest, scheduler, builder).
Serves GET /health on PORT so Railway (and similar) healthchecks succeed.
Runs in a daemon thread; no-op when PORT is not set (e.g. local dev).
"""
from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
def start_health_server(service_name: str) -> None:
    """
    Start a daemon thread that listens on PORT and responds to GET /health.
    Only starts when PORT is set (e.g. on Railway); otherwise no-op.
    """
    port_str = os.environ.get("PORT")
    if not port_str:
        return
    try:
        port = int(port_str)
    except ValueError:
        return

    body = json.dumps({"status": "ok", "service": service_name}).encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health" or self.path == "/health/":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            pass  # Suppress request logging

    def serve() -> None:
        with HTTPServer(("0.0.0.0", port), Handler) as httpd:
            httpd.serve_forever()

    t = threading.Thread(target=serve, daemon=True)
    t.start()
