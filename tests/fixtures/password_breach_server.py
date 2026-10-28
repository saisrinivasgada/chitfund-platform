"""Disposable range-API fixture; never used by the production compose stack."""

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import re

# A public test sentinel, not a user credential. E2E asserts that it is rejected.
BREACHED_PASSWORD = "KnownBreachFixture@123"
BREACHED_HASH = hashlib.sha1(BREACHED_PASSWORD.encode()).hexdigest().upper()


class RangeHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            return
        if not re.fullmatch(r"/range/[A-Fa-f0-9]{5}", self.path):
            self.send_error(400)
            return
        prefix = self.path.rsplit("/", 1)[-1].upper()
        body = (BREACHED_HASH[5:] + ":42\r\n" if prefix == BREACHED_HASH[:5]
                else "0" * 35 + ":0\r\n").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass  # Do not retain hash-prefix queries in CI logs.


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), RangeHandler).serve_forever()
