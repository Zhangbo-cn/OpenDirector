"""OpenAI-compatible stub standing in for a Kimi Code endpoint.

Serves GET /v1/models and a streaming POST /v1/chat/completions so the whole
path (preset shape -> connection -> discovery -> one agent turn) can be checked
without a subscription key. Records the Authorization header it received.
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = "kimi-k3"
seen = []


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        seen.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path.rstrip("/").endswith("/models"):
            self._json(200, {"object": "list", "data": [{"id": MODEL, "object": "model"}]})
        else:
            self._json(404, {"error": {"message": "not found"}})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        body = json.loads(raw or b"{}")
        seen.append(("POST", self.path, self.headers.get("Authorization"), body.get("model")))
        text = "Stub reply for " + str(body.get("model"))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        def chunk(delta, finish=None):
            payload = {
                "id": "stub-1", "object": "chat.completion.chunk",
         "created": int(time.time()), "model": body.get("model"),
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
            }
            self.wfile.write(b"data: " + json.dumps(payload).encode() + b"\n\n")
            self.wfile.flush()

        chunk({"role": "assistant", "content": ""})
        for piece in (text[:16], text[16:]):
            if piece:
                chunk({"content": piece})
        chunk({}, "stop")
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()
        # No length is known up front, so the stream ends by closing the socket.
        self.close_connection = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18100
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print("stub on 127.0.0.1:%d" % port, flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        print(json.dumps(seen, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
