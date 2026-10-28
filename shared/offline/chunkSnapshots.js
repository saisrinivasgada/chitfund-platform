import { listSnapshot, batchSnapshot } from './readSnapshots.js';

/** Iterate encrypted pages without materialising the organisation in memory. */
export async function chunkSnapshot(kind, pointer, params = {}, loadChunk, overlay) {
  const batches = kind === 'batches';
  const render = (records, options) => batches ? batchSnapshot(records, options) : listSnapshot(kind, records, options);
  if (!render([], params)) return null;
  const paged = params.page != null;
  const page = Number(params.page ?? 0);
  const size = Number(params.size ?? (batches ? 50 : 20));
  const start = paged ? page * size : 0;
  const end = paged ? start + size : Infinity;
  const sorted = !!params.sort || (batches && overlay?.chunks > 0);
  const [field, direction = 'asc'] = String(params.sort ?? (sorted ? 'createdAt,desc' : '')).split(',');
  const compare = (a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (direction === 'desc' ? -1 : 1);
  const content = [];
  let total = 0;
  const seen = new Set();
  const extra = overlay?.chunks ?? 0;
  // Track only recent receipt IDs. A refreshed full snapshot is authoritative
  // for existing receipts (for example a receipt subsequently voided online).
  for (let index = 0; index < extra; index++) for (const record of await overlay.loadChunk(index)) seen.add(record.id);
  for (let index = 0; index < pointer.chunks + extra; index++) {
    const records = index < pointer.chunks ? await loadChunk(index)
      : (await overlay.loadChunk(index - pointer.chunks)).filter((record) => seen.delete(record.id));
    if (index < pointer.chunks) for (const record of records) seen.delete(record.id);
    const { page: _page, size: _size, sort: _sort, ...filters } = params;
    const result = render(records, filters);
    const matching = batches ? result.data : result.data.content;
    for (const record of matching) {
      if (sorted) {
        // Keep only the requested sorted prefix. Binary insertion bounds memory
        // to the requested page, rather than the entire saved list.
        let lo = 0; let hi = content.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (compare(content[mid], record) <= 0) lo = mid + 1; else hi = mid; }
        if (lo < end) { content.splice(lo, 0, record); if (content.length > end) content.pop(); }
      } else if (total >= start && total < end) content.push(record);
      total++;
    }
  }
  const selected = sorted ? content.slice(start) : content;
  if (!paged && batches) return { success: true, data: selected };
  const actualSize = paged ? size : Math.max(1, total);
  const totalPages = Math.ceil(total / actualSize);
  return { success: true, data: batches
    ? { content: selected, totalElements: total, page, size: actualSize, hasMore: end < total }
    : { content: selected, totalElements: total, number: page, pageNumber: page, pageSize: actualSize,
      size: actualSize, totalPages, first: page === 0, last: page + 1 >= totalPages } };
}
