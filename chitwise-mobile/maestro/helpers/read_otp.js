// Reads the latest DEV OTP via the local OTP sidecar server (otp_server.py).
// Start the server before running tests: python3 maestro/helpers/otp_server.py
var response = http.get('http://localhost:9000/otp');
var data = json(response.body);
var otp = String(data.otp || '').padStart(6, '0');
output.otp = otp;
for (var i = 0; i < 6; i++) {
  output['digit' + (i + 1)] = otp.charAt(i);
}
