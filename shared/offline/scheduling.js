/** Keep each account ordered while allowing another account past a slow connection. */
export async function runAccountTasks(accounts, task, { deadline = Infinity, concurrency = 2 } = {}) {
  let next = 0;
  async function worker() {
    while (next < accounts.length && Date.now() < deadline) {
      const account = accounts[next++];
      try { await task(account); }
      catch { /* The owning queue preserves failures; other accounts can continue. */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) }, worker));
}
