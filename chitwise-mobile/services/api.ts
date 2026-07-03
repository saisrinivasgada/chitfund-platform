import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://Kittus-MacBook-Air.local:8080/api';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 20_000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('chitwise_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      SecureStore.deleteItemAsync('chitwise_token');
      SecureStore.deleteItemAsync('chitwise_user');
    }
    return Promise.reject(err);
  }
);

function unwrapList(res: any): any[] {
  const d = res.data?.data ?? res.data;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.content)) return d.content;
  return [];
}
function unwrapObj(res: any): any {
  return res.data?.data ?? res.data ?? {};
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface LoginResponse {
  token: string; userId: string; username: string; fullName: string; role: string;
  mustChangePassword: boolean;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const res = await api.post('/auth/login', { username, password });
  const d = res.data.data ?? res.data;
  if (d.accessToken && d.user) {
    return {
      token: d.accessToken,
      userId: d.user.id,
      username: d.user.username,
      fullName: d.user.fullName,
      role: d.user.role,
      mustChangePassword: d.user.mustChangePassword ?? false,
    };
  }
  return d;
};

export const getMe = async () => unwrapObj(await api.get('/users/me'));
export const changePassword = async (currentPassword: string, newPassword: string) =>
  unwrapObj(await api.post('/users/me/change-password', { currentPassword, newPassword }));
export const updateMyProfile = async (body: any) =>
  unwrapObj(await api.patch('/users/me/profile', body));
export const updateMyMemberProfile = async (body: any) =>
  unwrapObj(await api.patch('/members/me/profile', body));

// ── Staff ──────────────────────────────────────────────────────────────────────
export const listStaff = async () => unwrapList(await api.get('/users/staff'));
export const createStaff = async (body: any) => unwrapObj(await api.post('/users/staff', body));
export const deactivateStaff = async (id: string) => unwrapObj(await api.put(`/users/staff/${id}/deactivate`));
export const activateStaff = async (id: string) => unwrapObj(await api.put(`/users/staff/${id}/activate`));
export const changeStaffRole = async (id: string, role: string) =>
  unwrapObj(await api.patch(`/users/staff/${id}/role`, { role }));
export const resetMemberPassword = async (userId: string) =>
  unwrapObj(await api.post(`/users/${userId}/reset-password`));
export const adminSetPassword = async (userId: string, newPassword: string) =>
  unwrapObj(await api.post(`/admin/users/${userId}/set-password`, { newPassword }));
export const getUserById = async (userId: string) =>
  unwrapObj(await api.get(`/users/${userId}`));

// ── Members ───────────────────────────────────────────────────────────────────
export const getMembers = async () => unwrapList(await api.get('/members'));
export const getMember = async (id: string) => unwrapObj(await api.get(`/members/${id}`));
export const createMember = async (body: any) => unwrapObj(await api.post('/members', body));
export const updateMember = async (id: string, body: any) => unwrapObj(await api.put(`/members/${id}`, body));
export const patchMemberStatus = async (id: string, status: string, reason?: string) =>
  unwrapObj(await api.patch(`/members/${id}/status`, { status, reason }));
export const softDeleteMember = async (id: string) =>
  unwrapObj(await api.delete(`/members/${id}`));
export const getMyMemberProfile = async () => unwrapObj(await api.get('/members/me'));
export const linkMemberUser = async (memberId: string, userId: string) =>
  unwrapObj(await api.patch(`/members/${memberId}/link-user`, { userId }));
export const getMemberTotalBalance = async (memberId: string) => {
  const res = await api.get('/payments/balance/total', { params: { memberId } });
  return res.data?.data ?? 0;
};

// ── Chits ──────────────────────────────────────────────────────────────────────
export const getChits = async () => unwrapList(await api.get('/chits'));
export const getChit = async (id: string) => unwrapObj(await api.get(`/chits/${id}`));
export const createChit = async (body: any) => unwrapObj(await api.post('/chits', body));
export const updateChitStatus = async (id: string, status: string, startDate?: string) =>
  unwrapObj(await api.put(`/chits/${id}/status`, { status, startDate: startDate ?? null }));
export const getChitsForMember = async (memberId: string) =>
  unwrapList(await api.get(`/chits/member/${memberId}`));
export const getMyChits = async () => unwrapList(await api.get('/chits/mine'));

// ── Enrollments ───────────────────────────────────────────────────────────────
export const getEnrollments = async (chitId: string) =>
  unwrapList(await api.get(`/chits/${chitId}/enrollments`));
export const enrollMember = async (chitId: string, memberId: string) =>
  unwrapObj(await api.post(`/chits/${chitId}/enrollments`, { memberId }));
export const removeEnrollment = async (chitId: string, memberId: string) =>
  unwrapObj(await api.delete(`/chits/${chitId}/enrollments/${memberId}`));

// ── Winners ───────────────────────────────────────────────────────────────────
export const getWinners = async (chitId: string) =>
  unwrapList(await api.get(`/chits/${chitId}/winners`));
export const recordWinner = async (chitId: string, body: any) =>
  unwrapObj(await api.post(`/chits/${chitId}/winners`, body));

// ── Draws ──────────────────────────────────────────────────────────────────────
export const getDraws = async (chitId: string) =>
  unwrapList(await api.get(`/admin/draws/chit/${chitId}`));
export const openDraw = async (body: any) => unwrapObj(await api.post('/admin/draws/open', body));
export const closeDraw = async (drawId: string) => unwrapObj(await api.post(`/admin/draws/${drawId}/close`));
export const skipDraw = async (body: any) => unwrapObj(await api.post('/admin/draws/skip', body));
export const deleteDraw = async (drawId: string) => unwrapObj(await api.delete(`/admin/draws/${drawId}`));
export const getDrawPayments = async (drawId: string) => unwrapList(await api.get(`/admin/draws/${drawId}/payments`));

// ── Reservations (Scheduling) ─────────────────────────────────────────────────
export const getReservations = async (chitId: string) =>
  unwrapList(await api.get(`/chits/${chitId}/reservations`));
export const addReservationSlot = async (chitId: string, body: any) =>
  unwrapObj(await api.post(`/chits/${chitId}/reservations`, body));
export const removeReservationSlot = async (chitId: string, reservationId: string, reason?: string) =>
  unwrapObj(await api.delete(`/chits/${chitId}/reservations/${reservationId}`, { params: reason ? { reason } : {} }));
export const swapReservationSlots = async (chitId: string, slotAId: string, slotBId: string) =>
  unwrapObj(await api.post(`/chits/${chitId}/reservations/swap`, { slotAId, slotBId }));
export const shiftReservations = async (chitId: string, fromMonth: number) =>
  unwrapObj(await api.post(`/chits/${chitId}/reservations/shift`, null, { params: { fromMonth } }));
export const markSlotProcessed = async (chitId: string, reservationId: string) =>
  unwrapObj(await api.patch(`/chits/${chitId}/reservations/${reservationId}/process`));
export const updateReservationSlot = async (chitId: string, reservationId: string, body: any) =>
  unwrapObj(await api.put(`/chits/${chitId}/reservations/${reservationId}`, body));
export const hardDeleteReservationSlot = async (chitId: string, reservationId: string) =>
  unwrapObj(await api.delete(`/chits/${chitId}/reservations/${reservationId}/permanent`));

// ── Payments (installments) ────────────────────────────────────────────────────
export const collectPayment = async (body: any) => unwrapObj(await api.post('/payments/collect', body));
export const recordPayment = async (body: any) => unwrapObj(await api.post('/payments', body));
export const getPaymentHistory = async (memberId: string, chitId: string) =>
  unwrapList(await api.get('/payments/history', { params: { memberId, chitId } }));
export const getPaymentBatches = async (memberId?: string, chitId?: string) =>
  unwrapList(await api.get('/payments/batches', { params: { memberId, chitId } }));
export const getAllPaymentBatches = async (params: any = {}) =>
  unwrapList(await api.get('/payments/batches/all', { params }));
export const voidPaymentBatch = async (batchId: string, reason: string) =>
  unwrapObj(await api.post(`/payments/${batchId}/void`, { reason }));
export const remitPayment = async (batchId: string) =>
  unwrapObj(await api.post(`/payments/${batchId}/remit`));
export const getPendingRemittance = async () =>
  unwrapList(await api.get('/payments/pending-remittance'));
export const getMemberBalance = async (memberId: string, chitId: string) =>
  unwrapObj(await api.get('/payments/balance', { params: { memberId, chitId } }));

// ── Cash Requests ──────────────────────────────────────────────────────────────
export const getActiveCashRequests = async () =>
  unwrapList(await api.get('/payments/requests/active'));
export const createCashRequest = async (chitId: string, requestedAmount: number, notes?: string) =>
  unwrapObj(await api.post('/payments/requests', { chitId, requestedAmount, notes }));
export const adminCreateCashRequest = async (memberId: string, chitId: string, requestedAmount: number, workerId?: string, notes?: string) => {
  const params: any = { memberId };
  if (workerId) params.workerId = workerId;
  return unwrapObj(await api.post('/payments/requests/admin', { chitId, requestedAmount, notes }, { params }));
};
export const assignWorkerToRequest = async (requestId: string, workerId: string, adminNotes?: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/assign`, { workerId, adminNotes }));
export const collectForRequest = async (requestId: string) =>
  unwrapObj(await api.post(`/payments/requests/${requestId}/collect`));
export const voidCashPickup = async (requestId: string, reason: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/void-pickup`, null, { params: { reason } }));
export const getCashRequestAuditLog = async (requestId: string) =>
  unwrapList(await api.get(`/payments/requests/${requestId}/audit`));
export const cancelCashRequest = async (requestId: string, reason?: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/cancel`, null, { params: reason ? { reason } : {} }));
export const getMyRequests = async () => unwrapList(await api.get('/payments/requests/my-requests'));
export const getMyCashRequests = async () => unwrapList(await api.get('/payments/requests/my-requests'));
export const getWorkerRequests = async (workerId: string) =>
  unwrapList(await api.get(`/payments/requests/worker/${workerId}`));
export const getBatchesByCollector = async (collectorId: string) =>
  unwrapList(await api.get(`/payments/batches/collector/${collectorId}`));
export const updateCashRequest = async (requestId: string, body: { requestedAmount?: number; notes?: string }) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}`, body));
export const getMyAssignedRequests = async () => unwrapList(await api.get('/payments/requests/mine'));
export const getMyPendingBatches = async () => unwrapList(await api.get('/payments/batches/mine'));
export const getTodaysPaymentBatches = async () => unwrapList(await api.get('/payments/batches/today'));
export const getTodaysDraws = async () => unwrapList(await api.get('/admin/draws/today'));
export const getRecentDraws = async (days = 60) => { try { return unwrapList(await api.get('/admin/draws/recent', { params: { days } })); } catch { return []; } };
export const getTodaysPayouts = async () => unwrapList(await api.get('/payouts/today'));
export const getMyWorkerHistory = async () => unwrapList(await api.get('/payments/requests/mine/history'));
export const markPickedUp = async (requestId: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/pickup`));
export const rescheduleRequest = async (requestId: string, scheduledFor: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/reschedule`, null, { params: { scheduledFor } }));
export const cancelByWorker = async (requestId: string, reason?: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/cancel/worker`, null, { params: reason ? { reason } : {} }));

// ── Payouts ───────────────────────────────────────────────────────────────────
export const getAllPayouts = async (params: any = {}) =>
  unwrapList(await api.get('/payouts/all', { params }));
export const getPendingPayouts = async () => unwrapList(await api.get('/payouts/pending'));
export const getPayoutsForMember = async (memberId: string) =>
  unwrapList(await api.get(`/payouts/member/${memberId}`));
export const createPayout = async (body: any) => unwrapObj(await api.post('/payouts', body));
export const disbursePayout = async (id: string, body: any) =>
  unwrapObj(await api.post(`/payouts/${id}/disburse`, body));
export const cancelPayout = async (id: string, reason: string) =>
  unwrapObj(await api.post(`/payouts/${id}/cancel`, { reason }));
export const voidPayout = async (id: string, reason: string) =>
  unwrapObj(await api.post(`/payouts/${id}/void`, { reason }));
export const getPayoutsByChit = async (chitId: string) =>
  unwrapList(await api.get(`/payouts/chit/${chitId}`));

// ── Treasury (Wallet) ──────────────────────────────────────────────────────────
export const getWalletBalance = async () => unwrapObj(await api.get('/admin/wallet/balance'));
export const getWalletTransactions = async () => unwrapList(await api.get('/admin/wallet'));
export const addWalletTransaction = async (body: any) => unwrapObj(await api.post('/admin/wallet', body));
export const transferWallet = async (body: any) => unwrapObj(await api.post('/admin/wallet/transfer', body));

// ── Audit ──────────────────────────────────────────────────────────────────────
export const getAuditLogs = async (params: any = {}) => {
  try { return unwrapList(await api.get('/audit/logs', { params })); } catch { return []; }
};
export const getPaginatedAuditLogs = async (params: any = {}) =>
  unwrapList(await api.get('/audit/logs', { params }));
export const getAllCashRequests = async (params: any = {}) => {
  try { return unwrapList(await api.get('/payments/requests/all', { params })); } catch { return []; }
};
export const getEntityAuditHistory = async (entityType: string, entityId: string) => {
  try { return unwrapList(await api.get(`/audit/logs/${entityType}/${entityId}`)); } catch { return []; }
};
export const getChitAuditHistory = async (chitId: string) => {
  try { return unwrapList(await api.get(`/audit/logs/chit/${chitId}`)); } catch { return []; }
};

// ── Settlement ────────────────────────────────────────────────────────────────
export const getSettlementPreview = async (memberId: string, chitIds?: string[]) =>
  unwrapObj(await api.post('/settlement/preview', { memberId, chitIds: chitIds ?? null }));
export const confirmSettlement = async (memberId: string, chitItems: any[], notes?: string) =>
  unwrapObj(await api.post('/settlement/confirm', { memberId, chitItems, notes: notes ?? null }));
export const getMemberSettlements = async (memberId: string) =>
  unwrapList(await api.get(`/settlement/member/${memberId}`));

// ── Notifications ─────────────────────────────────────────────────────────────
export const getMyNotifications = async () => {
  try { return unwrapList(await api.get('/notifications/mine')); } catch { return []; }
};
export const getNotifications = async () => {
  try { return unwrapList(await api.get('/notifications')); } catch { return []; }
};
export const getUnreadCount = async () => {
  try {
    const res = await api.get('/notifications/unread-count');
    const d = res.data?.data;
    return typeof d === 'object' ? (d?.count ?? 0) : (d ?? 0);
  } catch { return 0; }
};
export const markNotificationRead = async (id: string) =>
  unwrapObj(await api.patch(`/notifications/${id}/read`));
export const markAllNotificationsRead = async () =>
  api.patch('/notifications/read-all').catch(() => {});

export default api;
