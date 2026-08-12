import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://3.21.196.51/api';

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
      useAuthStore.getState().logout();
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
  token: string; userId: string; username: string; fullName: string; role: string;
  mustChangePassword: boolean;
  // set when requiresTenantSelection = true
  requiresTenantSelection?: boolean;
  loginToken?: string;
  tenants?: TenantOption[];
}

function parseAuthResponse(auth: any): LoginResponse {
  return {
    token: auth.accessToken,
    userId: auth.user.id,
    username: auth.user.username,
    fullName: auth.user.fullName,
    role: auth.user.role,
    mustChangePassword: auth.user.mustChangePassword ?? false,
  };
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const res = await api.post('/auth/login', { username, password });
  const d = res.data.data ?? res.data;
  // Single-step: authResponse present immediately
  const auth = d.accessToken ? d : d.authResponse;
  if (auth?.accessToken && auth?.user) return parseAuthResponse(auth);
  // Two-step: tenant selection required
  if (d.requiresTenantSelection && d.loginToken) {
    return { token: '', userId: '', username, fullName: '', role: '', mustChangePassword: false,
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

export default api;
