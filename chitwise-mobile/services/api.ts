import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

const api = axios.create({ baseURL: API_BASE_URL, timeout: 20_000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('chitwise_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: any) => void; reject: (e: any) => void }> = [];

function processQueue(error: any, token: string | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('chitwise_refresh_token');
        if (!refreshToken) throw new Error('no_refresh');
        const resp = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefresh } = resp.data?.data ?? resp.data;
        await SecureStore.setItemAsync('chitwise_token', accessToken);
        if (newRefresh) await SecureStore.setItemAsync('chitwise_refresh_token', newRefresh);
        const { user } = useAuthStore.getState();
        if (user) await useAuthStore.getState().updateTokenForAccount(user.id, accessToken, newRefresh);
        processQueue(null, accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        const { user } = useAuthStore.getState();
        if (user) await useAuthStore.getState().markSessionInvalid(user.id);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    if (err.response?.data?.errorCode === 'PLAN_002') {
      useUIStore.getState().showPlanExpired();
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
export interface TenantOption {
  tenantId: string; name: string; slug: string; plan: string; role: string; status?: string;
}
export interface LoginResponse {
  token: string;
  refreshToken?: string;
  userId: string;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
  tenantId?: string;
  // set when requiresTenantSelection = true
  requiresTenantSelection?: boolean;
  loginToken?: string;
  tenants?: TenantOption[];
  // set when OTP step required (ADMIN/MANAGER/SUPER_ADMIN with phone)
  requiresOtp?: boolean;
  otpToken?: string;
  maskedPhone?: string;
}

function parseAuthResponse(auth: any): LoginResponse {
  return {
    token: auth.accessToken,
    refreshToken: auth.refreshToken,
    userId: auth.user.id,
    username: auth.user.username,
    fullName: auth.user.fullName,
    role: auth.user.role,
    mustChangePassword: auth.user.mustChangePassword ?? false,
    tenantId: auth.user.tenantId,
  };
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const res = await api.post('/auth/login', { username, password });
  const d = res.data.data ?? res.data;
  if (d.requiresOtp) {
    return { token: '', userId: '', username, fullName: '', role: '', mustChangePassword: false,
      requiresOtp: true, otpToken: d.otpToken, maskedPhone: d.maskedPhone };
  }
  const auth = d.accessToken ? d : d.authResponse;
  if (auth?.accessToken && auth?.user) return parseAuthResponse(auth);
  if (d.requiresTenantSelection && d.loginToken) {
    return { token: '', userId: '', username, fullName: '', role: '', mustChangePassword: false,
      requiresTenantSelection: true, loginToken: d.loginToken, tenants: d.tenants ?? [] };
  }
  return d;
};

export const verifyLoginOtp = async (otpToken: string, code: string): Promise<LoginResponse> => {
  const res = await api.post('/auth/verify-login-otp', { otpToken, code });
  const d = res.data.data ?? res.data;
  const auth = d.accessToken ? d : d.authResponse;
  if (auth?.accessToken && auth?.user) return parseAuthResponse(auth);
  if (d.requiresTenantSelection && d.loginToken) {
    return { token: '', userId: '', username: '', fullName: '', role: '', mustChangePassword: false,
      requiresTenantSelection: true, loginToken: d.loginToken, tenants: d.tenants ?? [] };
  }
  return d;
};

export const selectTenant = async (loginToken: string, tenantId: string): Promise<LoginResponse> => {
  const res = await api.post('/auth/select-tenant', { loginToken, tenantId });
  const d = res.data.data ?? res.data;
  const auth = d.accessToken ? d : d.authResponse;
  if (auth?.accessToken && auth?.user) return parseAuthResponse(auth);
  return d;
};

export const logoutAccount = async (refreshToken: string) => {
  try { await api.post('/auth/logout', { refreshToken }); } catch {}
};

export const logoutAllDevices = async () => {
  await api.post('/auth/logout-all');
};

export const getMe = async () => unwrapObj(await api.get('/users/me'));
export const changePassword = async (currentPassword: string, newPassword: string) =>
  unwrapObj(await api.post('/users/me/change-password', { currentPassword, newPassword }));
export const updateMyProfile = async (body: any) =>
  unwrapObj(await api.patch('/users/me/profile', body));
export const updateMyMemberProfile = async (body: any) =>
  unwrapObj(await api.patch('/members/me/profile', body));

// ── Staff ──────────────────────────────────────────────────────────────────────
export const listStaff = async () => {
  const data = unwrapList(await api.get('/users/staff'));
  return data.map((s: any) => s.role === 'WORKER' ? { ...s, role: 'STAFF' } : s);
};
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
export const resendSetupLink = async (userId: string) =>
  unwrapObj(await api.post(`/users/${userId}/resend-setup-link`));
export const sendPaymentReminder = async (userId: string) =>
  unwrapObj(await api.post(`/notifications/reminder/${userId}`));
export const sendWhatsAppReminder = async (body: { userId: string; phone?: string; memberName?: string; outstandingAmount?: string; chitName?: string }) =>
  (await api.post(`/notifications/whatsapp/${body.userId}`, body)).data;

// ── Members ───────────────────────────────────────────────────────────────────
export const getMembers = async (params: any = {}) =>
  unwrapList(await api.get('/members', { params: { size: 200, ...params } }));

export interface MembersPage {
  content: any[];
  totalElements: number;
  totalPages: number;
  number: number;
  last: boolean;
}

export const getMembersPage = async ({
  search = '', page = 0, size = 20, status,
}: { search?: string; page?: number; size?: number; status?: string } = {}): Promise<MembersPage> => {
  const params: any = { page, size };
  if (search) params.search = search;
  if (status) params.status = status;
  const res = await api.get('/members', { params });
  const d = res.data?.data;
  if (d && Array.isArray(d.content)) return d;
  return { content: Array.isArray(d) ? d : [], totalElements: 0, totalPages: 1, number: 0, last: true };
};
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
export const registerUser = async (body: { username: string; email: string }) =>
  (await api.post('/auth/register', { ...body, role: 'MEMBER' })).data?.data;
export const checkUsernameAvailability = async (username: string) =>
  (await api.get('/auth/check-username', { params: { username } })).data?.data as { username: string; available: boolean };
export const getMemberTotalBalance = async (memberId: string) => {
  const res = await api.get('/payments/balance/total', { params: { memberId } });
  return res.data?.data ?? 0;
};
export const getMemberCredit = async (memberId: string) =>
  (await api.get(`/payments/credits/${memberId}`)).data?.data ?? { balance: 0 };

// ── Chits ──────────────────────────────────────────────────────────────────────
export const getChits = async (params: any = {}) =>
  unwrapList(await api.get('/chits', { params: { size: 200, ...params } }));
export const getChit = async (id: string) => unwrapObj(await api.get(`/chits/${id}`));
export const createChit = async (body: any) => unwrapObj(await api.post('/chits', body));
export const updateChitStatus = async (id: string, status: string, startDate?: string) =>
  unwrapObj(await api.put(`/chits/${id}/status`, { status, startDate: startDate ?? null }));
export const updateChitName = async (id: string, name: string, description?: string) =>
  unwrapObj(await api.patch(`/chits/${id}/name`, { name, description }));
export const updateChitDetails = async (id: string, body: any) =>
  unwrapObj(await api.patch(`/chits/${id}/details`, body));
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
export const getOrgReservations = async () =>
  unwrapList(await api.get('/chits/org-reservations'));
export const realizeOrgPayout = async (chitId: string, reservationId: string) =>
  unwrapObj(await api.post(`/chits/${chitId}/reservations/${reservationId}/realize-org`));

// ── Payments (installments) ────────────────────────────────────────────────────
export const collectPayment = async (body: any) => unwrapObj(await api.post('/payments/collect', body));
export const recordPayment = async (body: any) => unwrapObj(await api.post('/payments', body));
export const getPaymentHistory = async (memberId: string, chitId: string) =>
  unwrapList(await api.get('/payments/history', { params: { memberId, chitId } }));
export const getPaymentBatches = async (memberId?: string, chitId?: string) =>
  unwrapList(await api.get('/payments/batches', { params: { memberId, chitId } }));
export const getPaymentBatchById = async (batchId: string) =>
  unwrapObj(await api.get(`/payments/batches/${batchId}`));
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
export const adminCreateCashRequest = async (memberId: string, chitId: string, requestedAmount: number, staffId?: string, notes?: string) => {
  const params: any = { memberId };
  if (staffId) params.staffId = staffId;
  return unwrapObj(await api.post('/payments/requests/admin', { chitId, requestedAmount, notes }, { params }));
};
export const assignStaffToRequest = async (requestId: string, staffId: string, adminNotes?: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/assign`, { staffId, adminNotes }));
export const collectForRequest = async (requestId: string) =>
  unwrapObj(await api.post(`/payments/requests/${requestId}/collect`));
export const voidCashPickup = async (requestId: string, reason: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/void-pickup`, null, { params: { reason } }));
export const getCashRequestAuditLog = async (requestId: string) =>
  unwrapList(await api.get(`/payments/requests/${requestId}/audit`));
export const cancelCashRequest = async (requestId: string, reason?: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/cancel`, null, { params: reason ? { reason } : {} }));
export const getMyRequests = async () => unwrapList(await api.get('/payments/requests/my-requests'));
export const getCashRequestSummary = async () => unwrapObj(await api.get('/payments/requests/summary'));
export const getMyCashRequests = async () => unwrapList(await api.get('/payments/requests/my-requests'));
export const getStaffRequests = async (staffId: string) =>
  unwrapList(await api.get(`/payments/requests/staff/${staffId}`));
export const getBatchesByCollector = async (collectorId: string) =>
  unwrapList(await api.get(`/payments/batches/collector/${collectorId}`));
export const updateCashRequest = async (requestId: string, body: {
  requestedAmount?: number | null;
  notes?: string | null;
  updateStaff?: boolean;
  staffId?: string | null;
  adminNotes?: string | null;
  scheduledFor?: string | null;
}) => unwrapObj(await api.patch(`/payments/requests/${requestId}`, body));
export const getMyAssignedRequests = async () => unwrapList(await api.get('/payments/requests/mine'));
export const getMyPaymentBatches = async () => unwrapList(await api.get('/payments/batches/member'));
export const getMyPendingBatches = async () => unwrapList(await api.get('/payments/batches/mine'));
export const getTodaysPaymentBatches = async () => unwrapList(await api.get('/payments/batches/today'));
export const getTodaysDraws = async () => unwrapList(await api.get('/admin/draws/today'));
export const getRecentDraws = async (days = 60) => { try { return unwrapList(await api.get('/admin/draws/recent', { params: { days } })); } catch { return []; } };
export const getTodaysPayouts = async () => unwrapList(await api.get('/payouts/today'));
export const getMyStaffHistory = async () => unwrapList(await api.get('/payments/requests/mine/history'));
export const markPickedUp = async (requestId: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/pickup`));
export const rescheduleRequest = async (requestId: string, scheduledFor: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/reschedule`, null, { params: { scheduledFor } }));
export const cancelByStaff = async (requestId: string, reason?: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/cancel/staff`, null, { params: reason ? { reason } : {} }));
export const partiallyCollectCashRequest = async (requestId: string, collectedAmount: number) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/partial-collect`, { collectedAmount }));
export const memberApproveCashRequest = async (requestId: string, approved: boolean, reason?: string) =>
  unwrapObj(await api.patch(`/payments/requests/${requestId}/member-approve`, { approved, reason }));

// ── Payouts ───────────────────────────────────────────────────────────────────
export const getAllPayouts = async (params: any = {}) =>
  unwrapList(await api.get('/payouts/all', { params }));
export const getPendingPayouts = async () => unwrapList(await api.get('/payouts/pending'));
export const getPayoutById = async (payoutId: string) =>
  unwrapObj(await api.get(`/payouts/${payoutId}`));
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
export const redeemMemberCredit = async (body: any) => unwrapObj(await api.post('/admin/wallet/credit-withdrawal', body));

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
export const confirmSettlement = async (
  memberId: string, chitItems: any[], notes?: string,
  adjustmentAmount?: number | null, adjustmentReason?: string | null,
) =>
  unwrapObj(await api.post('/settlement/confirm', {
    memberId, chitItems, notes: notes ?? null,
    adjustmentAmount: adjustmentAmount ?? null,
    adjustmentReason: adjustmentReason ?? null,
  }));
export const recordSettlementTransaction = async (
  settlementId: string, amount: number, mode: string,
  referenceNumber?: string | null, notes?: string | null, idempotencyKey?: string,
) =>
  unwrapObj(await api.post(`/settlement/${settlementId}/transactions`, {
    settlementId, amount, mode,
    referenceNumber: referenceNumber ?? null,
    notes: notes ?? null,
    idempotencyKey: idempotencyKey ?? `mob-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }));
export const getMemberSettlements = async (memberId: string, page = 0, size = 10) => {
  const res = await api.get(`/settlement/member/${memberId}?page=${page}&size=${size}`);
  return (res.data?.data ?? { content: [], totalPages: 0, totalElements: 0 }) as { content: any[]; totalPages: number; totalElements: number };
};
export const getPendingSettlements = async (page = 0, size = 20) => {
  const res = await api.get(`/settlement/pending-payments?page=${page}&size=${size}`);
  return (res.data?.data ?? { content: [], totalPages: 0, totalElements: 0 }) as { content: any[]; totalPages: number; totalElements: number };
};
export const getSettlementById = async (settlementId: string) =>
  unwrapObj(await api.get(`/settlement/${settlementId}`));

// Member-facing settlement endpoints (no admin token needed)
export const getMySettlements = async (page = 0, size = 10) => {
  const res = await api.get(`/settlement/my?page=${page}&size=${size}`);
  return (res.data?.data ?? { content: [], totalPages: 0, totalElements: 0 }) as { content: any[]; totalPages: number; totalElements: number };
};
export const getMySettlementById = async (settlementId: string) =>
  unwrapObj(await api.get(`/settlement/${settlementId}/my`));

// ── Billing info ──────────────────────────────────────────────────────────────
export const getBillingInfo = async () => {
  try { return unwrapObj(await api.get('/users/me/billing-info')); } catch { return null; }
};
export const getMyTenantLimits = async () => {
  try { return unwrapObj(await api.get('/users/me/tenant-limits')); } catch { return null; }
};
export const getPublicPlans = async () => {
  try { return unwrapList(await api.get('/plans/public')); } catch { return []; }
};
export const requestRenewal = async () =>
  unwrapObj(await api.post('/plans/renewal-request'));
export const requestPlanUpgrade = async (toPlan: string) =>
  unwrapObj(await api.post('/plans/upgrade-request', null, { params: { toPlan } }));
export const myBillingPayments = async () => {
  try { return unwrapList(await api.get('/billing/my-payments')); } catch { return []; }
};
export const myBillingUpgradePreview = async (newPlan: string) => {
  try { return unwrapObj(await api.get('/billing/upgrade-preview', { params: { newPlan } })); } catch { return null; }
};

// ── Super-admin ───────────────────────────────────────────────────────────────
export const superAdminListTenants = async (params: { status?: string } = {}) =>
  unwrapList(await api.get('/super-admin/tenants', { params }));
export const superAdminGetTenant = async (tenantId: string) =>
  unwrapObj(await api.get(`/super-admin/tenants/${tenantId}`));
export const superAdminActivateTenant = async (tenantId: string) =>
  unwrapObj(await api.post(`/super-admin/tenants/${tenantId}/activate`));
export const superAdminSuspendTenant = async (tenantId: string) =>
  unwrapObj(await api.post(`/super-admin/tenants/${tenantId}/suspend`));
export const superAdminSetTenantStatus = async (tenantId: string, status: string) =>
  unwrapObj(await api.patch(`/super-admin/tenants/${tenantId}/status`, null, { params: { status } }));
export const superAdminReactivateTenant = async (tenantId: string, newSlug?: string) =>
  unwrapObj(await api.post(`/super-admin/tenants/${tenantId}/reactivate`, null, newSlug ? { params: { newSlug } } : {}));
export const superAdminUpdatePlan = async (tenantId: string, plan: string) =>
  unwrapObj(await api.post(`/super-admin/tenants/${tenantId}/plan`, null, { params: { plan } }));
export const superAdminListOrgUsers = async (tenantId: string) =>
  unwrapList(await api.get(`/super-admin/tenants/${tenantId}/users`));
export const superAdminAddOrgUser = async (tenantId: string, body: any) =>
  unwrapObj(await api.post(`/super-admin/tenants/${tenantId}/users`, body));
export const superAdminUpdateTenant = async (tenantId: string, body: { name: string; slug?: string }) =>
  unwrapObj(await api.put(`/super-admin/tenants/${tenantId}`, body));
export const superAdminListOrgChits = async (tenantId: string) =>
  unwrapList(await api.get('/chits', { params: { tenantFilter: tenantId } }));
export const superAdminListUpgradeRequests = async () =>
  unwrapList(await api.get('/super-admin/tenants/upgrade-requests'));
export const superAdminListRenewalRequests = async () =>
  unwrapList(await api.get('/super-admin/tenants/renewal-requests'));
export const superAdminClearRenewalRequest = async (tenantId: string) =>
  api.delete(`/super-admin/tenants/${tenantId}/renewal-request`);
export const superAdminSetPlanExpiry = async (tenantId: string, expiresAt: string) =>
  unwrapObj(await api.put(`/super-admin/tenants/${tenantId}/plan-expiry`, null, { params: { expiresAt } }));
export const superAdminGetAllLimitsBulk = async () =>
  unwrapList(await api.get('/super-admin/tenants/limits-bulk'));
export const superAdminGetEffectiveLimits = async (tenantId: string) =>
  unwrapObj(await api.get(`/super-admin/tenants/${tenantId}/effective-limits`));
export const superAdminSetCustomLimits = async (tenantId: string, data: any) =>
  unwrapObj(await api.put(`/super-admin/tenants/${tenantId}/custom-limits`, data));
export const superAdminGetAdminCredentials = async (tenantId: string) =>
  unwrapObj(await api.get(`/super-admin/tenants/${tenantId}/credentials`));
// Promotions
export const superAdminListPromotions = async () =>
  unwrapList(await api.get('/super-admin/promotions'));
export const superAdminCreatePromotion = async (body: any) =>
  unwrapObj(await api.post('/super-admin/promotions', body));
export const superAdminUpdatePromotion = async (code: string, body: any) =>
  unwrapObj(await api.put(`/super-admin/promotions/${code}`, body));
export const superAdminDeletePromotion = async (code: string) =>
  api.delete(`/super-admin/promotions/${code}`);
// Plans
export const superAdminListPlans = async () =>
  unwrapList(await api.get('/super-admin/plans'));
export const superAdminCreatePlan = async (body: any) =>
  unwrapObj(await api.post('/super-admin/plans', body));
export const superAdminUpdatePlan2 = async (code: string, body: any) =>
  unwrapObj(await api.put(`/super-admin/plans/${code}`, body));
export const superAdminListCapabilities = async () =>
  unwrapList(await api.get('/super-admin/capabilities'));
export const superAdminAddCapability = async (label: string) =>
  unwrapObj(await api.post('/super-admin/capabilities', { label }));
export const superAdminDeleteCapability = async (key: string) =>
  api.delete(`/super-admin/capabilities/${key}`);
// SA Billing
export const billingListPayments = async (params: any = {}) =>
  unwrapList(await api.get('/super-admin/billing/payments', { params }));
export const billingRecordPayment = async (payload: any) =>
  unwrapObj(await api.post('/super-admin/billing/payments', payload));
export const billingUpgradePreview = async (tenantId: string, newPlan: string) =>
  unwrapObj(await api.get('/super-admin/billing/upgrade-preview', { params: { tenantId, newPlan } }));

// ── Reports (chit-level) ──────────────────────────────────────────────────────
export const getCollectionsReport = async (chitId: string) =>
  unwrapList(await api.get(`/reports/chit/${chitId}/collections`));
export const getMembersReport = async (chitId: string) =>
  unwrapList(await api.get(`/reports/chit/${chitId}/members`));
export const getPayoutsReport = async (chitId: string) =>
  unwrapList(await api.get(`/reports/chit/${chitId}/payouts`));

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

// ── Phone OTP (authenticated — for profile phone change) ─────────────────────
export const sendPhoneChangeOtp = async ({ phone, countryCode }: { phone: string; countryCode: string }) => {
  const res = await api.post('/users/me/phone/send-otp', { phone, countryCode });
  return res.data;
};
export const verifyPhoneChangeOtp = async ({ phone, countryCode, code }: { phone: string; countryCode: string; code: string }) => {
  const res = await api.post('/users/me/phone/verify-otp', { phone, countryCode, code });
  return res.data.data; // UserResponse with updated phone
};

// ── Admin phone OTP (for staff/member creation and phone updates) ─────────────
export const adminSendPhoneOtp = async ({ phone, countryCode }: { phone: string; countryCode: string }) => {
  const res = await api.post('/users/admin/phone/send-otp', { phone, countryCode });
  return res.data;
};
export const adminVerifyPhoneOtp = async ({ phone, countryCode, code }: { phone: string; countryCode: string; code: string }) => {
  const res = await api.post('/users/admin/phone/verify-otp', { phone, countryCode, code });
  return res.data;
};
export const adminUpdateUserPhone = async ({ userId, phone, countryCode }: { userId: string; phone: string; countryCode: string }) => {
  const res = await api.patch(`/users/${userId}/phone`, { phone, countryCode });
  return res.data.data;
};

// ── Self-service forgot password — 4-step flow ───────────────────────────────
export const forgotPasswordLookup = async (usernameOrPhone: string) => {
  const res = await api.post('/auth/forgot-password/lookup', { usernameOrPhone });
  return res.data.data as { userId: string; maskedPhone: string; locked: boolean; role: string };
};
export const forgotPasswordSendOtp = async ({ userId, last4 }: { userId: string; last4: string }) => {
  await api.post('/auth/forgot-password/send-otp', { userId, last4 });
};
export const forgotPasswordVerifyOtp = async ({ userId, code }: { userId: string; code: string }) => {
  const res = await api.post('/auth/forgot-password/verify-otp', { userId, code });
  return res.data.data as { resetToken: string };
};
export const forgotPasswordResetWithToken = async ({ resetToken, newPassword }: { resetToken: string; newPassword: string }) => {
  await api.post('/auth/forgot-password/reset-with-token', { resetToken, newPassword });
};

// ── Push token registration ───────────────────────────────────────────────────
export const registerPushToken = async (token: string, platform: string) => {
  try {
    await api.post('/notifications/push-token', { token, platform });
  } catch (e) {
    // non-fatal — push is best-effort
    console.warn('Push token registration failed:', e);
  }
};

export const unregisterPushToken = async (token: string) => {
  try {
    await api.delete('/notifications/push-token', { data: { token } });
  } catch {
    // ignore
  }
};

// ─── Support Tickets (org admin → ChitWise) ──────────────────────────────────
export const createSupportTicket = async (body: {
  type: string;
  subject: string;
  description?: string;
}): Promise<any> => {
  const res = await api.post('/tickets', body);
  return res.data.data;
};

export const listMyTickets = async ({ page = 0, size = 20 } = {}): Promise<any> => {
  const res = await api.get('/tickets', { params: { page, size } });
  return res.data.data;
};

export const getSupportTicket = async (ticketId: string): Promise<any> => {
  const res = await api.get(`/tickets/${ticketId}`);
  return res.data.data;
};

export const getTicketMessages = async (
  ticketId: string,
  { cursor, limit = 50 }: { cursor?: string; limit?: number } = {}
): Promise<any> => {
  const params: any = { limit };
  if (cursor) params.before = cursor;
  const res = await api.get(`/tickets/${ticketId}/messages`, { params });
  return res.data.data;
};

export const sendTicketMessage = async (ticketId: string, content: string): Promise<any> => {
  const res = await api.post(`/tickets/${ticketId}/messages`, { content });
  return res.data.data;
};

export const deleteTicketMessage = async (ticketId: string, messageId: string): Promise<void> => {
  await api.put(`/tickets/${ticketId}/messages/${messageId}/delete`);
};

export const markTicketRead = async (ticketId: string): Promise<void> => {
  await api.put(`/tickets/${ticketId}/read`);
};

// ─── Admin Support Contact (for members/staff/managers to contact admin) ──────
export const getAdminSupportContact = async (): Promise<{ supportPhoneNumber: string } | null> => {
  const res = await api.get('/users/tenant/support-contact');
  return res.data?.data ?? null;
};

export const sendSupportNumberOtp = async (phone: string, countryCode = '+91'): Promise<void> => {
  await api.post('/users/me/support-number/send-otp', { phone, countryCode });
};

export const verifySupportNumber = async (phone: string, code: string, countryCode = '+91'): Promise<void> => {
  await api.post('/users/me/support-number/verify', { phone, code, countryCode });
};

// ─── Chit Invitations ─────────────────────────────────────────────────────────
export const getMyInvitations = async (): Promise<any[]> => {
  try { return unwrapList(await api.get('/invitations/my')); } catch { return []; }
};

export const respondToInvitation = async (invId: string, body: {
  interested: boolean;
  reason?: string;
  spotsRequested?: number;
  requestedDrawNumbers?: number[];
}): Promise<any> => unwrapObj(await api.post(`/invitations/${invId}/respond`, body));

export const getChitInvitations = async (chitId: string): Promise<any[]> =>
  unwrapList(await api.get(`/chits/${chitId}/invitations`));

export const createInvitation = async (chitId: string, body: {
  message?: string;
  recipientMemberIds: string[];
}): Promise<any> => unwrapObj(await api.post(`/chits/${chitId}/invitations`, body));

export const closeInvitation = async (chitId: string, invId: string): Promise<any> =>
  unwrapObj(await api.patch(`/chits/${chitId}/invitations/${invId}/close`));

export const getInvitationResponses = async (chitId: string, invId: string): Promise<any[]> =>
  unwrapList(await api.get(`/chits/${chitId}/invitations/${invId}/responses`));

export const overrideInvitationResponse = async (chitId: string, invId: string, responseId: string, body: {
  approvedSpots?: number;
  approvedDrawNumbers?: number[];
}): Promise<any> => unwrapObj(await api.patch(`/chits/${chitId}/invitations/${invId}/responses/${responseId}`, body));

export const approveInvitationResponse = async (chitId: string, invId: string, responseId: string): Promise<any> =>
  unwrapObj(await api.post(`/chits/${chitId}/invitations/${invId}/responses/${responseId}/approve`));

// ── Auction ───────────────────────────────────────────────────────────────────
export const openAuction = async (params: {
  chitId: string;
  monthNumber: number;
  scheduledPayoutAmount: number;
  closesAt?: string | null;
  minBidStep?: number;
}) => {
  const body: any = {
    monthNumber: params.monthNumber,
    scheduledPayoutAmount: params.scheduledPayoutAmount,
    closesAt: params.closesAt ?? null,
  };
  if (params.minBidStep != null) body.minBidStep = params.minBidStep;
  return unwrapObj(await api.post(`/chits/${params.chitId}/auction/open`, body));
};

export const getAuction = async (chitId: string, auctionId: string) =>
  unwrapObj(await api.get(`/chits/${chitId}/auction/${auctionId}`));

export const listAuctions = async (chitId: string): Promise<any[]> =>
  unwrapList(await api.get(`/chits/${chitId}/auction`));

export const placeBid = async (params: {
  chitId: string;
  auctionId: string;
  bidAmount: number;
  onBehalfOfMemberId?: string;
}) => {
  const body: any = { bidAmount: params.bidAmount };
  if (params.onBehalfOfMemberId) body.onBehalfOfMemberId = params.onBehalfOfMemberId;
  return unwrapObj(await api.post(`/chits/${params.chitId}/auction/${params.auctionId}/bid`, body));
};

export const closeAuction = async (params: {
  chitId: string;
  auctionId: string;
  winnerId?: string;
  wonAmount?: number;
}) => {
  const body: any = {};
  if (params.winnerId) body.winnerId = params.winnerId;
  if (params.wonAmount != null) body.wonAmount = params.wonAmount;
  return unwrapObj(await api.post(`/chits/${params.chitId}/auction/${params.auctionId}/close`, body));
};

export const extendAuction = async (params: {
  chitId: string;
  auctionId: string;
  additionalMinutes: number;
}) =>
  unwrapObj(
    await api.patch(`/chits/${params.chitId}/auction/${params.auctionId}/extend`, {
      additionalMinutes: params.additionalMinutes,
    })
  );

export const voidAuction = async (params: { chitId: string; auctionId: string }) =>
  unwrapObj(await api.post(`/chits/${params.chitId}/auction/${params.auctionId}/void`));

// ─── Intra-org Conversations (Admin/Manager ↔ Member DMs) ────────────────────

export const listConversations = async ({ page = 0, size = 30 } = {}): Promise<any> => {
  const res = await api.get('/conversations', { params: { page, size } });
  return res.data.data;
};

export const startConversation = async (body: { memberId: string; memberName: string }): Promise<any> => {
  const res = await api.post('/conversations', body);
  return res.data.data;
};

export const getMyConversation = async (): Promise<any> => {
  const res = await api.get('/conversations/mine');
  return res.data.data;
};

export const getConversationUnread = async (): Promise<number> => {
  const res = await api.get('/conversations/unread');
  return res.data.data?.unread ?? 0;
};

export const getMemberConversationUnread = async (): Promise<number> => {
  const res = await api.get('/conversations/mine/unread');
  return res.data.data?.unread ?? 0;
};

export const getChatMessages = async (
  conversationId: string,
  { cursor, limit = 50 }: { cursor?: string; limit?: number } = {}
): Promise<any> => {
  const params: any = { limit };
  if (cursor) params.cursor = cursor;
  const res = await api.get(`/conversations/${conversationId}/messages`, { params });
  return res.data.data;
};

export const sendChatMessage = async (
  conversationId: string,
  content: string,
  clientMessageId?: string
): Promise<any> => {
  const res = await api.post(`/conversations/${conversationId}/messages`, { content, clientMessageId });
  return res.data.data;
};

export const deleteChatMessage = async (conversationId: string, messageId: string): Promise<void> => {
  await api.put(`/conversations/${conversationId}/messages/${messageId}/delete`);
};

export const markConversationRead = async (conversationId: string): Promise<void> => {
  await api.post(`/conversations/${conversationId}/read`);
};

// ─── Group Chat (Phase 3) ──────────────────────────────────────────────────────

export const createGroup = async (body: { name: string; description?: string; memberIds?: string[] }): Promise<any> => {
  const res = await api.post('/groups', body);
  return res.data.data;
};

export const listGroups = async ({ page = 0, size = 20 } = {}): Promise<any> => {
  const res = await api.get('/groups', { params: { page, size } });
  return res.data.data;
};

export const getGroupMembers = async (groupId: string): Promise<any[]> => {
  const res = await api.get(`/groups/${groupId}/members`);
  return res.data.data ?? [];
};

export const addGroupMember = async (groupId: string, body: { userId: string; userName: string; role?: string }): Promise<any> => {
  const res = await api.post(`/groups/${groupId}/members`, body);
  return res.data.data;
};

export const removeGroupMember = async (groupId: string, userId: string): Promise<void> => {
  await api.delete(`/groups/${groupId}/members/${userId}`);
};

export const getGroupMessages = async (groupId: string, { cursor, limit = 50 }: { cursor?: string; limit?: number } = {}): Promise<any> => {
  const params: any = { limit };
  if (cursor) params.cursor = cursor;
  const res = await api.get(`/groups/${groupId}/messages`, { params });
  return res.data.data;
};

export const sendGroupMessage = async (groupId: string, content: string, clientMessageId: string): Promise<any> => {
  const res = await api.post(`/groups/${groupId}/messages`, { content, clientMessageId });
  return res.data.data;
};

export const deleteGroupMessage = async (groupId: string, messageId: string): Promise<void> => {
  await api.put(`/groups/${groupId}/messages/${messageId}/delete`);
};

export default api;
