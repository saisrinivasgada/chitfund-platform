// Reads the latest DEV OTP via the local OTP sidecar server (otp_server.py).
// Start the server before running tests: python3 maestro/helpers/otp_server.py
var response = http.get('http://localhost:9000/otp');
var data = json(response.body);
output.otp = data.otp || '';
