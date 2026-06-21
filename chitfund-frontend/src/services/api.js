import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach auth token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth (user-service, no strip) ────────────────────────────────────────
export const login = async ({ username, password }) => {
  const res = await api.post('/auth/login', { username, password });
  return res.data.data;
};

export const getMe = async () => {
  const res = await api.get('/users/me');
  return res.data.data;
};

// ─── Auth helpers ──────────────────────────────────────────────────────────
// password intentionally omitted — backend auto-generates a temp password for member accounts
export const registerUser = async ({ username, email }) => {
  const res = await api.post('/auth/register', { username, email, role: 'MEMBER' });
  return res.data.data; // { accessToken, user, tempPassword }
};

export const resetMemberPassword = async (userId) => {
  const res = await api.post(`/users/${userId}/reset-password`);
  return res.data.data; // { userId, username, tempPassword }
};

export const changePassword = async ({ currentPassword, newPassword }) => {
  const res = await api.post('/users/me/change-password', { currentPassword, newPassword });
  return res.data.data;
};

export const getUserById = async (userId) => {
  const res = await api.get(`/users/${userId}`);
  return res.data.data;
};

export const checkUsernameAvailability = async (username) => {
  const res = await api.get('/users/check-username', { params: { username } });
  return res.data.data; // { available: true/false }
};

export const updateMyUserProfile = async ({ fullName, username, email, phone }) => {
  const res = await api.patch('/users/me/profile', { fullName, username, email, phone });
  return res.data.data; // updated UserResponse
};

// ─── Staff management (ADMIN only) ────────────────────────────────────────
export const listStaff = async ({ deleted = false } = {}) => {
  const res = await api.get('/users/staff', { params: { deleted } });
  return res.data.data ?? [];
};

// role must be 'ADMIN', 'MANAGER', or 'WORKER' — requires authenticated ADMIN token
export const createStaff = async ({ username, email, fullName, phone, role }) => {
  const res = await api.post('/users/staff', {
    username,
    email: email || null,
    fullName: fullName || null,
    phone: phone || null,
    role,
  });
  return res.data.data; // { accessToken, user, tempPassword }
};

export const deactivateStaff = async (id) => {
  const res = await api.put(`/users/staff/${id}/deactivate`);
  return res.data.data;
};

export const activateStaff = async (id) => {
  const res = await api.put(`/users/staff/${id}/activate`);
  return res.data.data;
};

export const changeStaffRole = async ({ id, role }) => {
  const res = await api.patch(`/users/staff/${id}/role`, { role });
  return res.data.data;
};

export const softDeleteStaff = async (id) => {
  const res = await api.delete(`/users/staff/${id}`);
  return res.data.data;
};

export const updateMyMemberProfile = async ({ fullName, phone, phoneCountryCode, email, address, city }) => {
  const res = await api.patch('/members/me/profile', { fullName, phone, phoneCountryCode, email, address, city });
  return res.data.data; // updated MemberResponse
};

// ─── Members (member-service, strip /api) ─────────────────────────────────
export const getMyMemberProfile = async () => {
  const res = await api.get('/members/me');
  return res.data.data;
};

export const linkMemberUser = async ({ memberId, userId }) => {
  const res = await api.patch(`/members/${memberId}/link-user`, { userId });
  return res.data.data;
};

export const getMembers = async (params = {}) => {
  const res = await api.get('/members', { params });
  return res.data.data?.content ?? res.data.data ?? [];
};

export const getMember = async (id) => {
  const res = await api.get(`/members/${id}`);
  return res.data.data;
};

export const createMember = async (body) => {
  const res = await api.post('/members', body);
  return res.data.data;
};

export const updateMember = async ({ id, ...body }) => {
  const res = await api.put(`/members/${id}`, body);
  return res.data.data;
};

export const patchMemberStatus = async ({ id, status, reason }) => {
  const res = await api.patch(`/members/${id}/status`, { status, reason });
  return res.data.data;
};

export const softDeleteMember = async (id) => {
  const res = await api.delete(`/members/${id}`);
  return res.data.data;
};

export const getDeletedMembers = async ({ search, page = 0, size = 20 } = {}) => {
  const res = await api.get('/members/deleted', { params: { search, page, size } });
  return res.data.data ?? { content: [], totalElements: 0 };
};

// ─── Chits (chit-service, no strip) ───────────────────────────────────────
export const getChits = async (params = {}) => {
  const res = await api.get('/chits', { params });
  return res.data.data?.content ?? res.data.data ?? [];
};

export const getChit = async (id) => {
  const res = await api.get(`/chits/${id}`);
  return res.data.data;
};

export const getChitsForMember = async (memberId) => {
  const res = await api.get(`/chits/member/${memberId}`);
  return res.data.data ?? [];
};

export const createChit = async (body) => {
  const res = await api.post('/chits', body);
  return res.data.data;
};

export const updateChitStatus = async ({ id, status, startDate }) => {
  const res = await api.put(`/chits/${id}/status`, { status, startDate: startDate ?? null });
  return res.data.data;
};

export const getDeletedChits = async ({ page = 0, size = 20 } = {}) => {
  const res = await api.get('/chits/deleted', { params: { page, size } });
  return res.data.data ?? { content: [], totalElements: 0 };
};

// ─── Enrollments ───────────────────────────────────────────────────────────
export const getEnrollments = async (chitId) => {
  const res = await api.get(`/chits/${chitId}/enrollments`);
  return res.data.data ?? [];
};

export const enrollMember = async ({ chitId, memberId }) => {
  const res = await api.post(`/chits/${chitId}/enrollments`, { memberId });
  return res.data.data;
};

export const removeEnrollment = async ({ chitId, memberId }) => {
  const res = await api.delete(`/chits/${chitId}/enrollments/${memberId}`);
  return res.data.data;
};

// ─── Winners ───────────────────────────────────────────────────────────────
export const getWinners = async (chitId) => {
  const res = await api.get(`/chits/${chitId}/winners`);
  return res.data.data ?? [];
};

export const recordWinner = async ({ chitId, ...body }) => {
  const res = await api.post(`/chits/${chitId}/winners`, body);
  return res.data.data;
};

// ─── Reservations ──────────────────────────────────────────────────────────
export const getReservations = async (chitId) => {
  const res = await api.get(`/chits/${chitId}/reservations`);
  return res.data.data ?? [];
};

export const addReservationSlot = async ({ chitId, ...body }) => {
  const res = await api.post(`/chits/${chitId}/reservations`, body);
  return res.data.data;
};

export const updateReservationSlot = async ({ chitId, reservationId, ...body }) => {
  const res = await api.put(`/chits/${chitId}/reservations/${reservationId}`, body);
  return res.data.data;
};

export const removeReservationSlot = async ({ chitId, reservationId, reason }) => {
  const params = reason ? { reason } : {};
  const res = await api.delete(`/chits/${chitId}/reservations/${reservationId}`, { params });
  return res.data.data;
};

export const hardDeleteReservationSlot = async ({ chitId, reservationId }) => {
  const res = await api.delete(`/chits/${chitId}/reservations/${reservationId}/permanent`);
  return res.data.data;
};

export const markSlotProcessed = async ({ chitId, reservationId }) => {
  const res = await api.patch(`/chits/${chitId}/reservations/${reservationId}/process`);
  return res.data.data;
};

export const swapSlots = async ({ chitId, slotAId, slotBId }) => {
  const res = await api.post(`/chits/${chitId}/reservations/swap`, { slotAId, slotBId });
  return res.data.data;
};

// Shifts all future RESERVED/UNALLOCATED slots forward by 1 month, called after a skip
export const shiftReservations = async ({ chitId, fromMonth }) => {
  const res = await api.post(`/chits/${chitId}/reservations/shift`, null, { params: { fromMonth } });
  return res.data.data;
};

// Legacy (kept for backward compat with ChitDetailPage reservation tab)
export const createReservation = async ({ chitId, memberId, monthNumber }) => {
  const res = await api.post(`/chits/${chitId}/reservations`, { memberId, monthNumber });
  return res.data.data;
};

// ─── Chit lifecycle actions ────────────────────────────────────────────────
export const pauseChit = async (id) => {
  const res = await api.post(`/chits/${id}/pause`);
  return res.data.data;
};

export const resumeChit = async (id) => {
  const res = await api.post(`/chits/${id}/resume`);
  return res.data.data;
};

export const deleteChit = async (id) => {
  const res = await api.delete(`/chits/${id}`);
  return res.data.data;
};

// ─── Payments (payment-service, strip /api) ────────────────────────────────
export const collectPayment = async (body) => {
  const res = await api.post('/payments/collect', body);
  return res.data.data;
};

export const openDraw = async (body) => {
  const res = await api.post('/admin/draws/open', body);
  return res.data.data;
};

export const getDraws = async (chitId) => {
  const res = await api.get(`/admin/draws/chit/${chitId}`);
  return res.data.data ?? [];
};

export const getDrawPayments = async (drawId) => {
  const res = await api.get(`/admin/draws/${drawId}/payments`);
  return res.data.data ?? [];
};

export const recordPayment = async ({ chitId, memberId, amount, paymentMode, notes }) => {
  const res = await api.post('/payments', { chitId, memberId, amount, paymentMode, notes });
  return res.data.data;
};

export const closeDraw = async (drawId) => {
  const res = await api.post(`/admin/draws/${drawId}/close`);
  return res.data.data;
};

export const deleteDraw = async (drawId) => {
  await api.delete(`/admin/draws/${drawId}`);
};

export const deleteWinnerForDraw = async ({ chitId, monthNumber }) => {
  await api.delete(`/chits/${chitId}/winners/draw/${monthNumber}`);
};

export const skipDraw = async (body) => {
  const res = await api.post('/admin/draws/skip', body);
  return res.data.data;
};

// chitIds: UUID[] → Map<chitId, latestCycleNumber>
export const getLatestDrawNumbers = async (chitIds) => {
  const res = await api.get('/admin/draws/latest-numbers', {
    params: { chitIds: chitIds.join(',') },
  });
  return res.data.data ?? {};
};

export const getPaymentHistory = async ({ memberId, chitId }) => {
  const res = await api.get('/payments/history', { params: { memberId, chitId } });
  return res.data.data ?? [];
};

export const getAllPaymentBatches = async ({ chitId, memberId, fromDate, toDate } = {}) => {
  const params = {};
  if (chitId) params.chitId = chitId;
  if (memberId) params.memberId = memberId;
  if (fromDate) params.fromDate = fromDate;
  if (toDate) params.toDate = toDate;
  const res = await api.get('/payments/batches/all', { params });
  return res.data.data ?? [];
};

export const getAllPayouts = async ({ chitId, fromDate, toDate } = {}) => {
  const params = {};
  if (chitId) params.chitId = chitId;
  if (fromDate) params.fromDate = fromDate;
  if (toDate) params.toDate = toDate;
  const res = await api.get('/payouts/all', { params });
  return res.data.data ?? [];
};

export const getMemberBalance = async ({ memberId, chitId }) => {
  const res = await api.get('/payments/balance', { params: { memberId, chitId } });
  return res.data.data;
};

export const getMemberTotalBalance = async (memberId) => {
  const res = await api.get('/payments/balance/total', { params: { memberId } });
  return res.data.data ?? 0;
};

export const getMemberBalanceBulk = async (memberIds) => {
  const res = await api.get('/payments/balance/bulk', { params: { memberIds: memberIds.join(',') } });
  return res.data.data ?? {};
};

export const getPendingRemittance = async () => {
  const res = await api.get('/payments/pending-remittance');
  return res.data.data ?? [];
};

export const getPaymentBatches = async ({ memberId, chitId }) => {
  const res = await api.get('/payments/batches', { params: { memberId, chitId } });
  return res.data.data ?? [];
};

export const voidPaymentBatch = async ({ batchId, reason }) => {
  const res = await api.post(`/payments/${batchId}/void`, { reason });
  return res.data.data;
};

export const remitPayment = async (batchId) => {
  const res = await api.post(`/payments/${batchId}/remit`);
  return res.data.data;
};

// ─── Cash payment requests ─────────────────────────────────────────────────
export const createCashRequest = async ({ chitId, requestedAmount, notes }) => {
  const res = await api.post('/payments/requests', { chitId, requestedAmount, notes });
  return res.data.data;
};

export const getActiveCashRequests = async () => {
  const res = await api.get('/payments/requests/active');
  return res.data.data ?? [];
};

export const getPendingCashRequests = async () => {
  const res = await api.get('/payments/requests/pending');
  return res.data.data ?? [];
};

export const assignWorkerToRequest = async ({ requestId, workerId, adminNotes }) => {
  const res = await api.patch(`/payments/requests/${requestId}/assign`, { workerId, adminNotes });
  return res.data.data;
};

export const getWorkerRequests = async (workerId) => {
  const res = await api.get(`/payments/requests/worker/${workerId}`);
  return res.data.data ?? [];
};

export const getMyAssignedRequests = async () => {
  const res = await api.get('/payments/requests/mine');
  return res.data.data ?? [];
};

export const getMyRequestHistory = async () => {
  const res = await api.get('/payments/requests/mine/history');
  return res.data.data ?? [];
};

export const getMyCashRequests = async () => {
  const res = await api.get('/payments/requests/my-requests');
  return res.data.data ?? [];
};

export const collectForRequest = async (requestId) => {
  const res = await api.post(`/payments/requests/${requestId}/collect`);
  return res.data.data;
};

export const cancelCashRequest = async ({ requestId, reason }) => {
  const params = reason ? { reason } : {};
  const res = await api.patch(`/payments/requests/${requestId}/cancel`, null, { params });
  return res.data.data;
};

export const adminCreateCashRequest = async ({ memberId, workerId, chitId, requestedAmount, notes }) => {
  const params = { memberId };
  if (workerId) params.workerId = workerId;
  const res = await api.post('/payments/requests/admin', { chitId, requestedAmount, notes }, { params });
  return res.data.data;
};

export const getMyPendingBatches = async () => {
  const res = await api.get('/payments/batches/mine');
  return res.data.data ?? [];
};

export const getBatchesByCollector = async (collectorId) => {
  const res = await api.get(`/payments/batches/collector/${collectorId}`);
  return res.data.data ?? [];
};

export const getTodaysPaymentBatches = async () => {
  const res = await api.get('/payments/batches/today');
  return res.data.data ?? [];
};

export const getPaymentBatchById = async (batchId) => {
  const res = await api.get(`/payments/batches/${batchId}`);
  return res.data.data;
};

export const getTodaysDraws = async () => {
  const res = await api.get('/admin/draws/today');
  return res.data.data ?? [];
};

// ─── Payouts (payout-service, strip /api) ─────────────────────────────────
export const createPayout = async (body) => {
  const res = await api.post('/payouts', body);
  return res.data.data;
};

export const getPayoutsByChit = async (chitId) => {
  const res = await api.get(`/payouts/chit/${chitId}`);
  return res.data.data ?? [];
};

export const getPayoutsForMember = async (memberId) => {
  const res = await api.get(`/payouts/member/${memberId}`);
  return res.data.data ?? [];
};

export const getPendingPayouts = async () => {
  const res = await api.get('/payouts/pending');
  return res.data.data ?? [];
};

export const disbursePayout = async ({ id, ...body }) => {
  const res = await api.post(`/payouts/${id}/disburse`, body);
  return res.data.data;
};

export const cancelPayout = async ({ id, reason }) => {
  const res = await api.post(`/payouts/${id}/cancel`, { reason });
  return res.data.data;
};

export const getTodaysPayouts = async () => {
  const res = await api.get('/payouts/today');
  return res.data.data ?? [];
};

// ─── Reports (reporting-service, strip /api) ───────────────────────────────
export const getCollectionsReport = async (chitId) => {
  const res = await api.get(`/reports/chit/${chitId}/collections`);
  return res.data.data ?? [];
};

export const getMembersReport = async (chitId) => {
  const res = await api.get(`/reports/chit/${chitId}/members`);
  return res.data.data ?? [];
};

export const getPayoutsReport = async (chitId) => {
  const res = await api.get(`/reports/chit/${chitId}/payouts`);
  return res.data.data ?? [];
};

// ─── Notifications (payment-service, strip /api) ───────────────────────────
export const getNotifications = async () => {
  const res = await api.get('/notifications');
  return res.data.data ?? [];
};

export const getUnreadCount = async () => {
  const res = await api.get('/notifications/unread-count');
  const data = res.data.data;
  // controller returns { count: N }
  return typeof data === 'object' ? (data?.count ?? 0) : (data ?? 0);
};

export const markNotificationRead = async (id) => {
  const res = await api.patch(`/notifications/${id}/read`);
  return res.data.data;
};

export const markAllNotificationsRead = async () => {
  await api.patch('/notifications/read-all');
};

export const sendPaymentReminder = async (userId) => {
  const res = await api.post(`/notifications/reminder/${userId}`);
  return res.data.data;
};

export const sendWhatsAppReminder = async ({ userId, phone, memberName, outstandingAmount, chitName }) => {
  const res = await api.post(`/notifications/whatsapp/${userId}`, { phone, memberName, outstandingAmount, chitName });
  return res.data;
};

// ─── Admin Wallet / Treasury (payment-service) ────────────────────────────
export const getWalletBalance = async () => {
  const res = await api.get('/admin/wallet/balance');
  return res.data.data;
};

export const getWalletTransactions = async () => {
  const res = await api.get('/admin/wallet');
  return res.data.data ?? [];
};

export const addWalletTransaction = async (payload) => {
  const res = await api.post('/admin/wallet', payload);
  return res.data.data;
};

export default api;
