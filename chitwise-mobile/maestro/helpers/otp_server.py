#!/usr/bin/env python3
"""
Local HTTP server that serves the latest DEV OTP from user-service.log.
Start before running Maestro tests: python3 maestro/helpers/otp_server.py
GET http://localhost:9000/otp  →  {"otp": "123456"}
"""
import http.server, re, json, sys, os

LOG_PATH = os.environ.get(
    'USER_SERVICE_LOG',
    '/Users/saisrinivas/Projects/learning/logs/user-service.log'
)

class OTPHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        otp = ''
        try:
            with open(LOG_PATH) as f:
                content = f.read()
            matches = re.findall(r'OTP: (\d{6})', content)
            if matches:
                otp = matches[-1]
        except Exception:
            pass
        body = json.dumps({'otp': otp}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9000
    print(f'OTP server on http://localhost:{port}/otp — reading {LOG_PATH}')
    http.server.HTTPServer(('localhost', port), OTPHandler).serve_forever()
