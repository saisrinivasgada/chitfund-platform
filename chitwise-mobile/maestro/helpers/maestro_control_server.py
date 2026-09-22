#!/usr/bin/env python3
"""
Tiny HTTP control server that Maestro runScript helpers call to start/stop
the chitwise-test-payment Docker container without requiring shell access
from inside the Maestro JS sandbox.

Usage:
  python3 maestro/helpers/maestro_control_server.py
  # then run the offline test suite

Endpoints:
  GET /stop-payment   — docker stop chitwise-test-payment
  GET /start-payment  — docker start chitwise-test-payment
  GET /status         — returns container running state
"""

import subprocess
import http.server
import json

CONTAINER = 'chitwise-test-payment'
PORT = 9001


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(fmt % args)

    def send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/stop-payment':
            result = subprocess.run(
                ['docker', 'stop', CONTAINER],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                self.send_json(200, {'action': 'stopped', 'container': CONTAINER})
            else:
                self.send_json(500, {'error': result.stderr.strip()})

        elif self.path == '/start-payment':
            result = subprocess.run(
                ['docker', 'start', CONTAINER],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                # Give the container a moment to become healthy
                import time; time.sleep(5)
                self.send_json(200, {'action': 'started', 'container': CONTAINER})
            else:
                self.send_json(500, {'error': result.stderr.strip()})

        elif self.path == '/status':
            result = subprocess.run(
                ['docker', 'inspect', '--format', '{{.State.Running}}', CONTAINER],
                capture_output=True, text=True, timeout=10
            )
            running = result.stdout.strip() == 'true'
            self.send_json(200, {'container': CONTAINER, 'running': running})

        else:
            self.send_json(404, {'error': 'unknown endpoint'})


if __name__ == '__main__':
    print(f'Maestro control server listening on port {PORT}')
    http.server.HTTPServer(('localhost', PORT), Handler).serve_forever()
