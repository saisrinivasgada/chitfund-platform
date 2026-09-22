// Stops the test payment service container so the next payment attempt will fail.
// Safe to call multiple times — docker stop is idempotent if container is already stopped.
var result = http.get('http://localhost:9001/stop-payment');
var body = result.body || result.content || '';
if (body.indexOf('"stopped"') === -1 && body.indexOf('"chitwise-test-payment"') === -1) {
  throw new Error('Control server did not confirm stop: ' + body);
}
