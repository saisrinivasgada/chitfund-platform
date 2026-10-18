// Host-side test control only. The production app contains no navigation hook.
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(QA_URL)) throw new Error('Local fixture only');
var response = http.post(QA_URL + '/__qa/open-link', {
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ link: APP_LINK })
});
if (!response.ok) throw new Error('Could not open the route on the isolated QA simulator: ' + response.body);
