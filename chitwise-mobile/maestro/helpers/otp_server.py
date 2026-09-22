#!/usr/bin/env python3
"""
Local HTTP server that serves the latest DEV OTP.

Primary source: MySQL phone_otps table (plaintext, reliable).
Fallback: USER_SERVICE_LOG file (for non-Docker dev mode).

Start before running Maestro tests: python3 maestro/helpers/otp_server.py
GET http://localhost:9000/otp  →  {"otp": "123456"}

Env vars:
  DB_HOST            (default: 127.0.0.1)
  DB_PORT            (default: 4306)
  DB_USER            (default: root)
  DB_PASSWORD        (default: testpassword)
  DB_NAME            (default: chitfund_user)
  USER_SERVICE_LOG   (fallback: log file path)
"""
import http.server, re, json, sys, os

LOG_PATH = os.environ.get('USER_SERVICE_LOG', '')
DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
DB_PORT = int(os.environ.get('DB_PORT', '4306'))
DB_USER = os.environ.get('DB_USER', 'root')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'testpassword')
DB_NAME = os.environ.get('DB_NAME', 'chitfund_user')


def _read_otp_from_db():
    import subprocess
    result = subprocess.run(
        ['docker', 'exec', 'chitwise-test-mysql', 'mysql',
         '-u', DB_USER, f'-p{DB_PASSWORD}',
         '-e', ("SELECT verification_code FROM chitfund_user.phone_otps "
                "WHERE verified = 0 AND expires_at > NOW() "
                "ORDER BY expires_at DESC LIMIT 1;"),
         '--skip-column-names'],
        capture_output=True, text=True, timeout=5
    )
    code = result.stdout.strip().splitlines()
    return code[-1].strip() if code else ''


def _read_otp_from_file(path):
    with open(path) as f:
        matches = re.findall(r'OTP: (\d{6})', f.read())
    return matches[-1] if matches else ''


class OTPHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        otp = ''
        try:
            otp = _read_otp_from_db()
        except Exception:
            pass
        if not otp and LOG_PATH:
            try:
                otp = _read_otp_from_file(LOG_PATH)
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
    print(f'OTP server on http://localhost:{port}/otp — primary: DB ({DB_HOST}:{DB_PORT})')
    http.server.HTTPServer(('localhost', port), OTPHandler).serve_forever()
