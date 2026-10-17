// Maestro's HTTP client runs on the test host; no production URL is permitted.
var endpoint = QA_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(endpoint)) throw new Error('Local fixture only');
var response = http.post(endpoint + '/__qa/state', {
  headers: { 'Content-Type': 'application/json' }, body: QA_STATE
});
if (!response.ok) throw new Error('Could not update local fixture');
