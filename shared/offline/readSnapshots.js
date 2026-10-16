/** Canonical server request identity shared by browser and native disk caches. */
export function requestKey(path, params = {}) {
  const index = path.indexOf('?');
  const query = index >= 0 ? Object.fromEntries(new URLSearchParams(path.slice(index + 1))) : {};
  const values = { ...query, ...params };
  return JSON.stringify([index >= 0 ? path.slice(0, index) : path,
    Object.fromEntries(Object.keys(values).filter((key) => values[key] != null).sort()
      .map((key) => [key, String(values[key])]))]);
}

export function cacheableRead(path, method = 'GET') {
  return method.toUpperCase() === 'GET'
    && /^\/(members|chits|admin\/draws|payments|payouts|admin\/wallet\/(balance|transactions)|users\/staff)(\/|$|\?)/.test(path)
    && !/\/(internal|identity|app-access|audit|otp|setup)(\/|$)/.test(path);
}

export function shouldRetryRead(failureCount, error, maximum = 2) {
  const status = error?.status ?? error?.response?.status;
  return !error?.offlineMissing && !error?.requiresLogin
    && ![400, 401, 403, 404, 410].includes(status) && failureCount < maximum;
}

export function mayKeepReadSnapshot(error) {
  return ![401, 403, 404, 410].includes(error?.status ?? error?.response?.status);
}

/** A complete list supports pages and searches that were never opened online. */
export function listSnapshot(kind, records, params = {}) {
  if (!['members', 'chits'].includes(kind)
      || Object.keys(params).some((key) => !['page', 'size', 'search', 'status', 'sort', 'type', 'chitType'].includes(key))) return null;
  let filtered = records;
  if (params.status && params.status !== 'ALL') filtered = filtered.filter((record) => record.status === params.status);
  const type = params.type ?? params.chitType;
  if (type && type !== 'ALL') filtered = filtered.filter((record) => (record.type ?? record.chitType) === type);
  if (params.search) {
    const term = String(params.search).toLocaleLowerCase().trim();
    filtered = filtered.filter((record) => [record.fullName, record.name, record.phone, record.email]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(term)));
  }
  if (params.sort) {
    const [field, direction = 'asc'] = String(params.sort).split(',');
    if (!['name', 'fullName', 'createdAt', 'updatedAt', 'id'].includes(field)) return null;
    filtered = [...filtered].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (direction === 'desc' ? -1 : 1));
  }
  const page = params.page == null ? 0 : Number(params.page);
  const size = params.page == null ? Math.max(1, filtered.length) : Number(params.size ?? 20);
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1) return null;
  const totalPages = Math.ceil(filtered.length / size);
  return { success: true, data: { content: filtered.slice(page * size, (page + 1) * size),
    number: page, pageNumber: page, pageSize: size, size, first: page === 0,
    totalElements: filtered.length, totalPages, last: page + 1 >= totalPages } };
}

/** Preserve payment-service filtering and page/hasMore response contracts. */
export function batchSnapshot(records, params = {}) {
  if (Object.keys(params).some((key) => !['page', 'size', 'memberId', 'chitId', 'fromDate', 'toDate'].includes(key))) return null;
  if ([params.fromDate, params.toDate].some((value) => value != null && !/^\d{4}-\d{2}-\d{2}$/.test(value))) return null;
  const filtered = records.filter((record) => (!params.memberId || record.memberId === params.memberId)
    && (!params.chitId || record.chitId === params.chitId)
    && (!params.fromDate || (record.createdAt && record.createdAt.slice(0, 10) >= params.fromDate))
    && (!params.toDate || (record.createdAt && record.createdAt.slice(0, 10) <= params.toDate)));
  if (params.page == null) return { success: true, data: filtered };
  const page = Number(params.page); const size = Number(params.size ?? 50);
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1) return null;
  return { success: true, data: { content: filtered.slice(page * size, (page + 1) * size),
    totalElements: filtered.length, page, size, hasMore: (page + 1) * size < filtered.length } };
}
