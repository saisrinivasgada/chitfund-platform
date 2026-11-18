"""Minimal HTTP server that echoes all request headers as JSON.
Used by NginxTrustedClientIpTest to inspect what headers nginx forwards.
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json


class HeaderEchoHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        headers = {k.lower(): v for k, v in self.headers.items()}
        body = json.dumps(headers).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8000), HeaderEchoHandler)
    server.serve_forever()
