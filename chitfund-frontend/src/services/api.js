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
    const isAuthEndpoint = err.config?.url?.includes('/auth/');
    if (err.response?.status === 401 && !isAuthEndpoint) {
      // Session expired mid-session — clear storage and redirect to login
      // Skip this for auth endpoints (login/register) so errors are shown to the user
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

export const mobileLookup = async (phone, phoneCountryCode) => {
  const params = { phone };
  if (phoneCountryCode) params.phoneCountryCode = phoneCountryCode;
  const res = await api.post('/auth/mobile-lookup', null, { params });
  return res.data.data; // { singleAccount, accounts: [{ role, displayLabel }] }
};

export const loginByMobile = async ({ phone, phoneCountryCode, password, role }) => {
  const res = await api.post('/auth/login-mobile', {
    phone,
    phoneCountryCode: phoneCountryCode || undefined,
    password,
    role: role || undefined,
  });
  return res.data.data;
};

// ─── Auth helpers ──────────────────────────────────────────────────────────
// Admin-only, idempotent: if the email already exists as an unlinked MEMBER account
// (partial failure from a previous attempt), it reuses that user with a fresh temp
// password instead of failing with EMAIL_TAKEN.
export const createMemberLogin = async ({ username, email }) => {
  const res = await api.post('/users/create-member-login', { username, email });
  return res.data.data; // { userId, tempPassword }
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

export const updateMyUserProfile = async ({ fullName, username, email, phone, phoneCountryCode }) => {
  const res = await api.patch('/users/me/profile', { fullName, username, email, phone, phoneCountryCode });
  return res.data.data; // updated UserResponse
};

// ─── Staff management (ADMIN only) ────────────────────────────────────────
export const listStaff = async ({ deleted = false } = {}) => {
  const res = await api.get('/users/staff', { params: { deleted } });
  const data = res.data.data ?? [];
  return data.map((s) => s.role === 'WORKER' ? { ...s, role: 'STAFF' } : s);
};

// role must be 'ADMIN', 'MANAGER', or 'STAFF' — requires authenticated ADMIN token
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

export const updateChitName = async ({ id, name, description }) => {
  const res = await api.patch(`/chits/${id}/name`, { name, description });
  return res.data.data;
};

export const getDeletedChits = async ({ page = 0, size = 20 } = {}) => {
  const res = await api.get('/chits/deleted', { params: { page, size } });
  return res.data.data ?? { content: [], totalElements: 0 };
};

export const getCancelledChits = async ({ page = 0, size = 100 } = {}) => {
  const res = await api.get('/chits', { params: { page, size, status: 'CANCELLED' } });
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

export const getSlotHistory = async (slotId) => {
  const res = await api.get(`/audit/logs/RESERVATION_SLOT/${slotId}`);
  const data = res.data.data;
  return Array.isArray(data) ? data : (data?.content ?? []);
};

// Legacy (kept for backward compat with ChitDetailPage reservation tab)
export const createReservation = async ({ chitId, memberId, monthNumber }) => {
  const res = await api.post(`/chits/${chitId}/reservations`, { memberId, monthNumber });
  return res.data.data;
};

export const getOrgReservations = async () => {
  const res = await api.get('/chits/org-reservations');
  return res.data.data ?? [];
};

export const realizeOrgPayout = async ({ chitId, reservationId }) => {
  const res = await api.post(`/chits/${chitId}/reservations/${reservationId}/realize-org`);
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
export const collectPayment = async (body, idempotencyKey) => {
  const headers = idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {};
  const res = await api.post('/payments/collect', body, { headers });
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

export const updatePromisedDate = async ({ recordId, promisedPaymentDate }) => {
  const res = await api.patch(`/payments/records/${recordId}/promised-date`, { promisedPaymentDate });
  return res.data.data;
};

export const recordPayment = async ({ chitId, memberId, amount, paymentMode, notes, idempotencyKey }) => {
  const headers = idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {};
  const res = await api.post('/payments', { chitId, memberId, amount, paymentMode, notes }, { headers });
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

export const getAllPaymentBatches = async ({ chitId, memberId, fromDate, toDate, page, size = 50 } = {}) => {
  const params = {};
  if (chitId) params.chitId = chitId;
  if (memberId) params.memberId = memberId;
  if (fromDate) params.fromDate = fromDate;
  if (toDate) params.toDate = toDate;
  if (page != null) { params.page = page; params.size = size; }
  const res = await api.get('/payments/batches/all', { params });
  const data = res.data.data;
  if (page != null) {
    if (Array.isArray(data)) return { content: data, hasMore: false, totalElements: data.length };
    return data ?? { content: [], hasMore: false, totalElements: 0 };
  }
  return Array.isArray(data) ? data : (data ?? []);
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

export const getChitOutstandingSummary = async (chitId) => {
  const res = await api.get('/payments/balance/chit-summary', { params: { chitId } });
  return res.data.data ?? { totalOutstanding: 0, membersWithOutstanding: 0 };
};

export const getMemberCredit = async (memberId) => {
  const res = await api.get(`/payments/credits/${memberId}`);
  return res.data.data ?? { memberId, balance: 0, recentTransactions: [] };
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

// Marks a payment record as PAYOUT_DEDUCTED — installment withheld from winner's payout.
// No batch, no treasury movement. amountPaid set to amountDue so draw card shows paid.
export const markPayoutDeducted = async ({ chitId, memberId, monthNumber, payoutId }) => {
  await api.post('/payments/mark-payout-deducted', { chitId, memberId, monthNumber, payoutId });
};

// Reverts all PAYOUT_DEDUCTED records linked to a payout back to OUTSTANDING.
export const revertPayoutDeductions = async (payoutId) => {
  await api.post(`/payments/revert-payout-deductions/${payoutId}`);
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

export const assignStaffToRequest = async ({ requestId, staffId, adminNotes }) => {
  const res = await api.patch(`/payments/requests/${requestId}/assign`, { staffId, adminNotes });
  return res.data.data;
};

export const getStaffRequests = async (staffId) => {
  const res = await api.get(`/payments/requests/staff/${staffId}`);
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

export const getMyPaymentBatches = async () => {
  const res = await api.get('/payments/batches/member');
  return res.data.data ?? [];
};

export const markPickedUp = async (requestId) => {
  const res = await api.patch(`/payments/requests/${requestId}/pickup`);
  return res.data.data;
};

export const rescheduleRequest = async ({ requestId, scheduledFor }) => {
  const res = await api.patch(`/payments/requests/${requestId}/reschedule`, null, {
    params: { scheduledFor },
  });
  return res.data.data;
};

export const staffCancelRequest = async ({ requestId, reason }) => {
  const params = reason ? { reason } : {};
  const res = await api.patch(`/payments/requests/${requestId}/cancel/staff`, null, { params });
  return res.data.data;
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

export const voidCashPickup = async ({ requestId, reason }) => {
  const params = reason ? { reason } : {};
  const res = await api.patch(`/payments/requests/${requestId}/void-pickup`, null, { params });
  return res.data.data;
};

export const updateCashRequest = async ({ requestId, requestedAmount, updateStaff, staffId, adminNotes, scheduledFor }) => {
  const res = await api.patch(`/payments/requests/${requestId}`, {
    requestedAmount: requestedAmount ?? null,
    updateStaff: updateStaff ?? false,
    staffId: staffId ?? null,
    adminNotes: adminNotes ?? null,
    scheduledFor: scheduledFor ?? null,
  });
  return res.data.data;
};

export const getCashRequestAuditLog = async (requestId) => {
  const res = await api.get(`/payments/requests/${requestId}/audit`);
  return res.data.data;
};

export const adminCreateCashRequest = async ({ memberId, staffId, chitId, requestedAmount, notes, scheduledFor }) => {
  const params = { memberId };
  if (staffId) params.staffId = staffId;
  const body = { chitId, requestedAmount, notes };
  if (scheduledFor) body.scheduledFor = scheduledFor;
  const res = await api.post('/payments/requests/admin', body, { params });
  return res.data.data;
};

export const getCashRequestSummary = async () => {
  const res = await api.get('/payments/requests/summary');
  return res.data.data;
};

export const getCancelledCashRequests = async () => {
  const res = await api.get('/payments/requests/cancelled');
  return res.data.data ?? [];
};

export const partiallyCollectCashRequest = async ({ requestId, collectedAmount }) => {
  const res = await api.patch(`/payments/requests/${requestId}/partial-collect`, { collectedAmount });
  return res.data.data;
};

export const memberApproveCashRequest = async ({ requestId, approved, reason }) => {
  const res = await api.patch(`/payments/requests/${requestId}/member-approve`, { approved, reason });
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

export const getPayoutById = async (payoutId) => {
  const res = await api.get(`/payouts/${payoutId}`);
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

export const voidPayout = async ({ id, reason }) => {
  const res = await api.post(`/payouts/${id}/void`, { reason });
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
  const res = await api.get('/notifications/mine');
  return res.data.data?.content ?? res.data.data ?? [];
};

export const getUnreadCount = async () => {
  const res = await api.get('/notifications/unread-count');
  const data = res.data.data;
  return typeof data === 'object' ? (data?.count ?? 0) : (data ?? 0);
};

// Member profile change history from audit log
export const getMemberAuditHistory = async (memberId) => {
  try {
    const res = await api.get('/audit/logs', {
      params: { entityType: 'MEMBER', entityId: memberId, size: 30, sort: 'createdAt,desc' },
    });
    return res.data.data?.content ?? res.data.data ?? [];
  } catch {
    return [];
  }
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

// ─── Settlement (payment-service) ─────────────────────────────────────────
export const getSettlementPreview = async ({ memberId, chitIds }) => {
  const res = await api.post('/settlement/preview', { memberId, chitIds: chitIds ?? null });
  return res.data.data;
};

export const confirmSettlement = async ({ memberId, chitItems, notes }) => {
  const res = await api.post('/settlement/confirm', { memberId, chitItems, notes: notes ?? null });
  return res.data.data;
};

export const getMemberSettlements = async (memberId) => {
  const res = await api.get(`/settlement/member/${memberId}`);
  return res.data.data ?? [];
};

// ─── Admin Wallet / Treasury (payment-service) ────────────────────────────
export const getWalletBalance = async () => {
  const res = await api.get('/admin/wallet/balance');
  return res.data.data;
};

export const getWalletTransactions = async ({ page, size = 50 } = {}) => {
  const params = {};
  if (page != null) { params.page = page; params.size = size; }
  const res = await api.get('/admin/wallet', { params });
  const data = res.data.data;
  if (page != null) {
    // Handle both old backend (returns array) and new backend (returns { content, hasMore })
    if (Array.isArray(data)) return { content: data, hasMore: false, totalElements: data.length };
    return data ?? { content: [], hasMore: false, totalElements: 0 };
  }
  return Array.isArray(data) ? data : (data ?? []);
};

export const addWalletTransaction = async (payload) => {
  const res = await api.post('/admin/wallet', payload);
  return res.data.data;
};

export const transferWallet = async (payload) => {
  const res = await api.post('/admin/wallet/transfer', payload);
  return res.data.data;
};

// ── Team Notes ────────────────────────────────────────────────────────────────
export const getTeamNotes = async () => {
  const res = await api.get('/members/notes');
  return res.data.data ?? [];
};
export const createTeamNote = async ({ text, visibility }) => {
  const res = await api.post('/members/notes', { text, visibility });
  return res.data.data;
};
export const updateTeamNote = async (id, { text, visibility }) => {
  const res = await api.put(`/members/notes/${id}`, { text, visibility });
  return res.data.data;
};
export const deleteTeamNote = async (id) => {
  await api.delete(`/members/notes/${id}`);
};

export default api;
