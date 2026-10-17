/** Refresh authoritative dues and instalments after a confirmed server receipt. */
export async function refreshFinancialSnapshots(adapter, original, receipt) {
  if (!original?.memberId || !original?.chitId || !receipt?.id) return;
  const chits = [...new Set([original.chitId, ...(receipt.allocations ?? []).map((a) => a.chitId).filter(Boolean)])];
  const jobs = [
    ['/payments/balance/total', { memberId: original.memberId }],
    [`/payments/credits/${original.memberId}`, {}],
    [`/payments/batches/${receipt.id}`, {}],
    ...chits.flatMap((chitId) => ['/payments/balance', '/payments/history', '/payments/batches']
      .map((path) => [path, { memberId: original.memberId, chitId }])),
  ];
  for (let i = 0; i < jobs.length; i += 3) {
    await Promise.allSettled(jobs.slice(i, i + 3).map(async ([path, params]) => {
      const response = await adapter.request(path, params);
      await adapter.saveResponse(path, params, response);
    }));
  }
  for (const chitId of chits) {
    try {
      const path = `/admin/draws/chit/${chitId}`;
      const response = await adapter.request(path, {});
      await adapter.saveResponse(path, {}, response);
      const draws = response?.data ?? response;
      const months = new Set((receipt.allocations ?? []).filter((a) => (a.chitId ?? original.chitId) === chitId).map((a) => a.monthNumber));
      for (const draw of (Array.isArray(draws) ? draws : draws?.content ?? []).filter((d) => months.has(d.monthNumber ?? d.drawNumber))) {
        const detail = `/admin/draws/${draw.id}/payments`;
        await adapter.saveResponse(detail, {}, await adapter.request(detail, {}));
      }
    } catch { /* A missed refresh keeps its last-known timestamp and is retried by preparation. */ }
  }
}
