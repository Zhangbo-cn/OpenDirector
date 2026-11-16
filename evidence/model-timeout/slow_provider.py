"""Minimal OpenAI-compatible endpoint whose first byte never arrives in time.

Used to reproduce the agent-turn hang without involving any real provider.
"""
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DELAY = 600  # seconds before the first byte; far beyond the gateway read timeout


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        print("[slow]", self.command, self.path, time.strftime("%H:%M:%S"), flush=True)

    def do_GET(self):
        if self.path.rstrip("/").endswith("/models"):
            body = json.dumps({"object": "list", "data": [
                {"id": "slow-model", "object": "model"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404)

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        self.rfile.read(length)
        print("[slow] holding the request open for %ds" % DELAY, flush=True)
        time.sleep(DELAY)          # never sends status line or body
        self.send_error(504)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 18099), Handler).serve_forever()
