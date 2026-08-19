import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// In-memory token store — JWT access token never touches localStorage
let _authToken = null;
export const setAuthToken = (token) => { _authToken = token; };
export const clearAuthToken = () => { _authToken = null; };

// Attach auth token on every request except auth endpoints (login, etc.)
// Proxy sessions (super-admin impersonating) use sessionStorage; real sessions use memory.
api.interceptors.request.use((config) => {
  const isAuthEndpoint = config.url?.includes('/auth/');
  if (!isAuthEndpoint) {
    const token = sessionStorage.getItem('token') ?? _authToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 + plan-expiry globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthEndpoint = err.config?.url?.includes('/auth/');
    if (err.response?.status === 401 && !isAuthEndpoint) {
      clearAuthToken();
      localStorage.removeItem('user');
      localStorage.removeItem('tenantId');
      localStorage.removeItem('tenantSlug');
      localStorage.removeItem('tenantName');
      localStorage.removeItem('tenantPlan');
      localStorage.removeItem('tenantStatus');
      localStorage.removeItem('planExpiresAt');
      localStorage.removeItem('analyticsEnabled');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/session-expired';
    }
    if (err.response?.data?.errorCode === 'PLAN_002') {
      window.dispatchEvent(new CustomEvent('plan-expired'));
    }
    return Promise.reject(err);
  }
);

// ─── Auth (user-service, no strip) ────────────────────────────────────────

// Restores session using HttpOnly refresh token cookie (called on page load)
export const refreshSession = async () => {
  const res = await api.post('/auth/refresh', {});
  return res.data.data; // AuthResponse { accessToken, refreshToken, user }
};

// Verifies the login OTP for ADMIN/MANAGER/SUPER_ADMIN after password step
export const verifyLoginOtp = async ({ otpToken, code, rememberDevice = false }) => {
  const res = await api.post('/auth/verify-login-otp', { otpToken, code, rememberDevice });
  return res.data.data; // LoginResponse — includes deviceToken if rememberDevice=true
};

export const resendLoginOtp = async ({ otpToken }) => {
  await api.post('/auth/resend-login-otp', { otpToken });
};

const DEVICE_TOKEN_KEY = 'chitwise_device_token';

export const getStoredDeviceToken = () => localStorage.getItem(DEVICE_TOKEN_KEY);
export const saveDeviceToken = (token) => localStorage.setItem(DEVICE_TOKEN_KEY, token);
export const clearDeviceToken = () => localStorage.removeItem(DEVICE_TOKEN_KEY);

// Returns LoginResponse { requiresTenantSelection, loginToken?, tenants?, authResponse?, requiresOtp?, otpToken?, maskedPhone? }
export const login = async ({ username, password }) => {
  const deviceToken = getStoredDeviceToken();
  const headers = deviceToken ? { 'X-Device-Token': deviceToken } : {};
  const res = await api.post('/auth/login', { username, password }, { headers });
  return res.data.data;
};

// Step 2: exchange pre-scope loginToken + tenantId → full scoped AuthResponse
export const selectTenant = async ({ loginToken, tenantId }) => {
  const res = await api.post('/auth/select-tenant', { loginToken, tenantId });
  return res.data.data; // AuthResponse { accessToken, refreshToken, user }
};

// Public: org self-registration (status = PENDING until super-admin activates)
export const checkSlugAvailability = async (slug, signal) => {
  const res = await api.get('/auth/check-slug', { params: { slug }, signal });
  return res.data.data; // { slug, available }
};

export const checkUsernameAvailability = async (username, signal) => {
  const res = await api.get('/auth/check-username', { params: { username }, signal });
  return res.data.data; // { username, available }
};

export const registerOrg = async (body) => {
  const res = await api.post('/auth/register-org', body);
  return res.data.data; // TenantResponse
};

// Member sets up their account via SMS link token
export const setupAccount = async ({ token, newPassword, fullName, termsAccepted }) => {
  const res = await api.post('/auth/setup-account', { token, newPassword, fullName, termsAccepted });
  return res.data.data; // AuthResponse or LoginResponse
};

// Generate a short-lived pre-scope token for cross-subdomain org switching.
// Needs explicit Authorization header because the interceptor skips /auth/ endpoints.
export const generateTransferToken = async () => {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const res = await api.post('/auth/transfer-token', null, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.data.data; // PreScopeAuthResponse { loginToken, tenants }
};

// Self-service password reset — 4-step flow
export const forgotPasswordLookup = async ({ usernameOrPhone }) => {
  const res = await api.post('/auth/forgot-password/lookup', { usernameOrPhone });
  return res.data.data; // { userId, maskedPhone, locked, role }
};
export const forgotPasswordSendOtp = async ({ userId, last4 }) => {
  await api.post('/auth/forgot-password/send-otp', { userId, last4 });
};
export const forgotPasswordVerifyOtp = async ({ userId, code }) => {
  const res = await api.post('/auth/forgot-password/verify-otp', { userId, code });
  return res.data.data; // { resetToken }
};
export const forgotPasswordResetWithToken = async ({ resetToken, newPassword }) => {
  await api.post('/auth/forgot-password/reset-with-token', { resetToken, newPassword });
};

// Legacy (kept for backward compat)
export const sendForgotPasswordOtp = async ({ phone, countryCode }) => {
  await api.post('/auth/forgot-password/send', { phone, countryCode });
};
export const resetPasswordViaOtp = async ({ phone, countryCode, otpCode, newPassword }) => {
  await api.post('/auth/forgot-password/reset', { phone, countryCode, otpCode, newPassword });
};

// ─── Super-admin (user-service /api/super-admin/**) ───────────────────────
export const superAdminListTenants = async ({ status } = {}) => {
  const params = status ? { status } : {};
  const res = await api.get('/super-admin/tenants', { params });
  return res.data.data ?? [];
};

export const superAdminGetTenant = async (tenantId) => {
  const res = await api.get(`/super-admin/tenants/${tenantId}`);
  return res.data.data;
};

export const superAdminActivateTenant = async (tenantId) => {
  const res = await api.post(`/super-admin/tenants/${tenantId}/activate`);
  return res.data.data;
};

export const superAdminSuspendTenant = async (tenantId) => {
  const res = await api.post(`/super-admin/tenants/${tenantId}/suspend`);
  return res.data.data;
};

export const superAdminSetTenantStatus = async (tenantId, status) => {
  const res = await api.patch(`/super-admin/tenants/${tenantId}/status`, null, { params: { status } });
  return res.data.data;
};

export const superAdminReactivateTenant = async (tenantId, newSlug) => {
  const params = newSlug ? { newSlug } : {};
  const res = await api.post(`/super-admin/tenants/${tenantId}/reactivate`, null, { params });
  return res.data.data;
};

export const superAdminGetAdminCredentials = async (tenantId) => {
  const res = await api.get(`/super-admin/tenants/${tenantId}/credentials`);
  return res.data.data;
};

export const superAdminProxyAs = async (tenantId, role, userId) => {
  const params = userId ? `?role=${role}&userId=${userId}` : `?role=${role}`;
  const res = await api.post(`/super-admin/tenants/${tenantId}/proxy${params}`);
  return res.data.data;
};

export const superAdminUpdatePlan = async (tenantId, plan) => {
  const res = await api.post(`/super-admin/tenants/${tenantId}/plan`, null, { params: { plan } });
  return res.data.data;
};

export const superAdminListUpgradeRequests = async () => {
  const res = await api.get('/super-admin/tenants/upgrade-requests');
  return res.data.data ?? [];
};

export const superAdminListRenewalRequests = async () => {
  const res = await api.get('/super-admin/tenants/renewal-requests');
  return res.data.data ?? [];
};

export const superAdminClearRenewalRequest = async (tenantId) => {
  await api.delete(`/super-admin/tenants/${tenantId}/renewal-request`);
};

export const requestPlanUpgrade = async (toPlan) => {
  const res = await api.post('/plans/upgrade-request', null, { params: { toPlan } });
  return res.data;
};

export const requestRenewal = async () => {
  const res = await api.post('/plans/renewal-request');
  return res.data;
};

export const superAdminUpdateTenant = async (tenantId, { name, slug }) => {
  const res = await api.put(`/super-admin/tenants/${tenantId}`, { name, slug });
  return res.data.data;
};

export const superAdminListOrgUsers = async (tenantId) => {
  const res = await api.get(`/super-admin/tenants/${tenantId}/users`);
  return res.data.data ?? [];
};

export const superAdminAddOrgUser = async (tenantId, userData) => {
  const res = await api.post(`/super-admin/tenants/${tenantId}/users`, userData);
  return res.data.data;
};

export const superAdminSetupAppAccess = async (userId, username) => {
  const res = await api.post(`/super-admin/tenants/users/${userId}/setup-app-access`, { username });
  return res.data.data; // { userId, username, tempPassword }
};

export const superAdminListOrgChits = async (tenantId, { status } = {}) => {
  const params = { tenantFilter: tenantId };
  if (status) params.status = status;
  const res = await api.get('/chits', { params });
  return res.data.data?.content ?? res.data.data ?? [];
};

export const superAdminSetPlanExpiry = async (tenantId, expiresAt) => {
  // expiresAt: ISO string or null (clears expiry)
  const params = expiresAt ? { expiresAt } : {};
  const res = await api.put(`/super-admin/tenants/${tenantId}/plan-expiry`, null, { params });
  return res.data.data;
};

export const superAdminGetEffectiveLimits = async (tenantId) => {
  const res = await api.get(`/super-admin/tenants/${tenantId}/effective-limits`);
  return res.data.data;
};

export const superAdminGetAllLimitsBulk = async () => {
  const res = await api.get('/super-admin/tenants/limits-bulk');
  return res.data.data ?? [];
};

export const superAdminChitUsageSummary = async () => {
  const res = await api.get('/super-admin/chits/usage-summary');
  return res.data.data ?? [];
};

export const superAdminMemberUsageSummary = async () => {
  const res = await api.get('/super-admin/members/usage-summary');
  return res.data.data ?? [];
};

export const getMyEffectiveLimits = async () => {
  const res = await api.get('/users/me/effective-limits');
  return res.data.data ?? null;
};

export const superAdminSetCustomLimits = async (tenantId, data) => {
  const res = await api.put(`/super-admin/tenants/${tenantId}/custom-limits`, data);
  return res.data.data;
};

export const superAdminRemoveCustomLimits = async (tenantId, fallbackPlan = 'BASIC') => {
  const res = await api.delete(`/super-admin/tenants/${tenantId}/custom-limits`, { params: { fallbackPlan } });
  return res.data;
};

// ─── Public plans (no auth needed) ────────────────────────────────────────
export const getPublicPlans = async () => {
  const res = await api.get('/plans/public');
  return res.data.data ?? [];
};

// ─── Super-admin plan definition CRUD ─────────────────────────────────────
export const superAdminListPlans = async () => {
  const res = await api.get('/super-admin/plans');
  return res.data.data ?? [];
};

export const superAdminCreatePlanDef = async (body) => {
  const res = await api.post('/super-admin/plans', body);
  return res.data.data;
};

export const superAdminUpdatePlanDef = async (code, body) => {
  const res = await api.put(`/super-admin/plans/${code}`, body);
  return res.data.data;
};

export const superAdminDeletePlanDef = async (code) => {
  await api.delete(`/super-admin/plans/${code}`);
};

// ─── Capability definitions ────────────────────────────────────────────────
export const superAdminListCapabilities = async () => {
  const res = await api.get('/super-admin/capabilities');
  return res.data.data ?? [];
};
export const superAdminAddCapability = async (label) => {
  const res = await api.post('/super-admin/capabilities', { label });
  return res.data.data;
};
export const superAdminDeleteCapability = async (key) => {
  await api.delete(`/super-admin/capabilities/${key}`);
};

// ─── Per-org discount ──────────────────────────────────────────────────────
export const superAdminGetDiscount = async (tenantId) => {
  const res = await api.get(`/super-admin/tenants/${tenantId}/discount`);
  return res.data.data ?? null;
};

export const superAdminSetDiscount = async (tenantId, body) => {
  const res = await api.post(`/super-admin/tenants/${tenantId}/discount`, body);
  return res.data.data;
};

export const superAdminRemoveDiscount = async (tenantId) => {
  await api.delete(`/super-admin/tenants/${tenantId}/discount`);
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

// Returns LoginResponse { requiresTenantSelection, loginToken?, tenants?, authResponse? }
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
export const createMemberLogin = async ({ username, email, phone, phoneCountryCode }) => {
  const res = await api.post('/users/create-member-login', { username, email, phone, phoneCountryCode });
  return res.data.data; // { userId, tempPassword }
};

export const resetMemberPassword = async (userId) => {
  const res = await api.post(`/users/${userId}/reset-password`);
  return res.data.data; // { userId, username, tempPassword }
};

export const resendSetupLink = async (userId) => {
  const res = await api.post(`/users/${userId}/resend-setup-link`);
  return res.data.data; // { setupToken, userId }
};

export const changePassword = async ({ currentPassword, newPassword }) => {
  const res = await api.post('/users/me/change-password', { currentPassword, newPassword });
  return res.data.data;
};

export const getUserById = async (userId) => {
  const res = await api.get(`/users/${userId}`);
  return res.data.data;
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
export const createStaff = async ({ username, email, fullName, phone, phoneCountryCode, role }) => {
  const res = await api.post('/users/staff', {
    username,
    email: email || null,
    fullName: fullName || null,
    phone: phone || null,
    phoneCountryCode: phoneCountryCode || '+91',
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

export const lockUser = async (id) => {
  const res = await api.put(`/users/${id}/lock`);
  return res.data.data;
};

export const unlockUser = async (id) => {
  const res = await api.put(`/users/${id}/unlock`);
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
  const res = await api.get('/members', { params: { size: 200, ...params } });
  return res.data.data?.content ?? res.data.data ?? [];
};

export const getMembersPage = async ({ search = '', page = 0, size = 20, status } = {}) => {
  const params = { page, size };
  if (search) params.search = search;
  if (status) params.status = status;
  const res = await api.get('/members', { params });
  return res.data.data ?? { content: [], totalElements: 0, totalPages: 0, number: 0 };
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

export const updateChitDetails = async ({ id, ...body }) => {
  const res = await api.patch(`/chits/${id}/details`, body);
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

export const assignStaffToRequest = async ({ requestId, staffId, adminNotes, staffRole }) => {
  const res = await api.patch(`/payments/requests/${requestId}/assign`, { staffId, adminNotes, assigneeRole: staffRole ?? 'STAFF' });
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

export const adminCreateCashRequest = async ({ memberId, staffId, staffRole, chitId, requestedAmount, notes, scheduledFor }) => {
  const params = { memberId };
  if (staffId) params.staffId = staffId;
  if (staffRole) params.assigneeRole = staffRole;
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

export const getTodaysChitActivity = async () => {
  const res = await api.get('/chits/updated-today');
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

// Full chronological audit trail for a chit (draws, payments, payouts, reservations)
export const getChitAuditLogs = async (chitId, page = 0, size = 100) => {
  try {
    const res = await api.get(`/audit/logs/chit/${chitId}`, {
      params: { page, size, sort: 'createdAt,desc' },
    });
    return res.data.data?.content ?? res.data.data ?? [];
  } catch {
    return [];
  }
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

export const confirmSettlement = async ({ memberId, chitItems, notes, adjustmentAmount, adjustmentReason }) => {
  const res = await api.post('/settlement/confirm', {
    memberId, chitItems, notes: notes ?? null,
    adjustmentAmount: adjustmentAmount ?? null,
    adjustmentReason: adjustmentReason ?? null,
  });
  return res.data.data;
};

export const recordSettlementTransaction = async ({ settlementId, amount, mode, referenceNumber, notes, idempotencyKey }) => {
  const res = await api.post(`/settlement/${settlementId}/transactions`, {
    settlementId, amount, mode,
    referenceNumber: referenceNumber || null,
    notes: notes || null,
    idempotencyKey,
  });
  return res.data.data;
};

export const getMemberSettlements = async (memberId, page = 0, size = 10) => {
  const res = await api.get(`/settlement/member/${memberId}?page=${page}&size=${size}`);
  return res.data.data ?? { content: [], totalPages: 0, totalElements: 0 };
};

export const getPendingSettlements = async (page = 0, size = 20) => {
  const res = await api.get(`/settlement/pending-payments?page=${page}&size=${size}`);
  return res.data.data ?? { content: [], totalPages: 0, totalElements: 0 };
};

export const getAllSettlements = async (page = 0, size = 20) => {
  const res = await api.get(`/settlement/all?page=${page}&size=${size}`);
  return res.data.data ?? { content: [], totalPages: 0, totalElements: 0 };
};

export const voidSettlement = async (settlementId) => {
  const res = await api.post(`/settlement/${settlementId}/void`);
  return res.data.data;
};

export const getSettlementById = async (settlementId) => {
  const res = await api.get(`/settlement/${settlementId}`);
  return res.data.data;
};

export const getSettlementTransactions = async (settlementId) => {
  const res = await api.get(`/settlement/${settlementId}/transactions`);
  return res.data.data ?? [];
};

export const getMemberPaymentHistoryByChit = async (memberId, chitId) => {
  const res = await api.get('/payments/history', { params: { memberId, chitId } });
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

export const redeemMemberCredit = async (payload) => {
  const res = await api.post('/admin/wallet/credit-withdrawal', payload);
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

// ── Phone OTP (public — for registration) ─────────────────────────────────
export const sendRegistrationOtp = async ({ phone, countryCode }) => {
  const res = await api.post('/auth/otp/send', { phone, countryCode });
  return res.data; // { success, message }
};
export const verifyRegistrationOtp = async ({ phone, countryCode, code }) => {
  const res = await api.post('/auth/otp/verify', { phone, countryCode, code });
  return res.data.data; // { verificationToken }
};

// ── Phone OTP (authenticated — for profile phone change) ──────────────────
export const sendPhoneChangeOtp = async ({ phone, countryCode }) => {
  const res = await api.post('/users/me/phone/send-otp', { phone, countryCode });
  return res.data;
};
export const verifyPhoneChangeOtp = async ({ phone, countryCode, code }) => {
  const res = await api.post('/users/me/phone/verify-otp', { phone, countryCode, code });
  return res.data.data; // UserResponse with updated phone
};

// ─── Admin phone OTP (for staff/member creation and phone updates) ─────────
export const adminSendPhoneOtp = async ({ phone, countryCode }) => {
  const res = await api.post('/users/admin/phone/send-otp', { phone, countryCode });
  return res.data;
};
export const adminVerifyPhoneOtp = async ({ phone, countryCode, code }) => {
  const res = await api.post('/users/admin/phone/verify-otp', { phone, countryCode, code });
  return res.data;
};
export const adminUpdateUserPhone = async ({ userId, phone, countryCode }) => {
  const res = await api.patch(`/users/${userId}/phone`, { phone, countryCode });
  return res.data.data;
};

// ─── Tenant plan limits (for feature gating in frontend) ──────────────────
export const getMyTenantLimits = async () => {
  const res = await api.get('/users/me/tenant-limits');
  return res.data.data;
};

// ─── Referral info for org admin ──────────────────────────────────────────
export const getMyReferralInfo = async () => {
  const res = await api.get('/users/me/referral');
  return res.data.data;
};

// ─── Promotions (public — no auth needed) ─────────────────────────────────
export const getPublicPromotions = async () => {
  const res = await api.get('/public/promotions');
  return res.data.data ?? [];
};

export const validatePromoCode = async (code, plan) => {
  const params = { code };
  if (plan) params.plan = plan;
  const res = await api.get('/public/promotions/validate', { params });
  return res.data.data;
};

// ─── Promotions (super-admin) ──────────────────────────────────────────────
export const superAdminListPromotions = async () => {
  const res = await api.get('/superadmin/promotions');
  return res.data.data ?? [];
};

export const superAdminCreatePromotion = async (body) => {
  const res = await api.post('/superadmin/promotions', body);
  return res.data.data;
};

export const superAdminUpdatePromotion = async (id, body) => {
  const res = await api.put(`/superadmin/promotions/${id}`, body);
  return res.data.data;
};

export const superAdminSetPromotionVisibility = async (id, isPublic) => {
  const res = await api.patch(`/superadmin/promotions/${id}/visibility`, { isPublic });
  return res.data.data;
};

export const superAdminDeactivatePromotion = async (id) => {
  const res = await api.delete(`/superadmin/promotions/${id}`);
  return res.data.data;
};

export const superAdminListReferralCredits = async (status) => {
  const params = status ? { status } : {};
  const res = await api.get('/superadmin/promotions/referral-credits', { params });
  return res.data.data ?? [];
};

export const superAdminAddTenantCredit = async (tenantId, amountInr, notes) => {
  const res = await api.post(`/super-admin/tenants/${tenantId}/credits`, { amountInr, notes });
  return res.data.data;
};

export const superAdminDeductTenantCredit = async (tenantId, amountInr, notes) => {
  const res = await api.post(`/super-admin/tenants/${tenantId}/credits/deduct`, { amountInr, notes });
  return res.data.data;
};

export const getMyBillingInfo = async () => {
  const res = await api.get('/users/me/billing-info');
  return res.data.data ?? null;
};

// ── Plan Billing / Payments ────────────────────────────────────────────────────

export const billingUpgradePreview = async (tenantId, newPlan) => {
  const res = await api.get('/super-admin/billing/upgrade-preview', { params: { tenantId, newPlan } });
  return res.data.data;
};

export const billingRecordPayment = async (payload) => {
  const res = await api.post('/super-admin/billing/payments', payload);
  return res.data.data;
};

export const billingRecordUpgrade = async (payload) => {
  const res = await api.post('/super-admin/billing/payments/upgrade', payload);
  return res.data.data;
};

export const billingRecordRefund = async (paymentId, payload) => {
  const res = await api.post(`/super-admin/billing/payments/${paymentId}/refund`, payload);
  return res.data.data;
};

export const billingListPayments = async ({ tenantId, page = 0, size = 20 } = {}) => {
  const params = { page, size, ...(tenantId ? { tenantId } : {}) };
  const res = await api.get('/super-admin/billing/payments', { params });
  return res.data.data;
};

export const billingGetPayment = async (paymentId) => {
  const res = await api.get(`/super-admin/billing/payments/${paymentId}`);
  return res.data.data;
};

export const billingGetReceipt = async (receiptId) => {
  const res = await api.get(`/super-admin/billing/receipts/${receiptId}`);
  return res.data.data;
};

export const myBillingUpgradePreview = async (newPlan) => {
  const res = await api.get('/billing/upgrade-preview', { params: { newPlan } });
  return res.data.data;
};

export const myBillingPayments = async () => {
  const res = await api.get('/billing/my-payments');
  return res.data.data ?? [];
};

export const myBillingReceipt = async (receiptId) => {
  const res = await api.get(`/billing/receipts/${receiptId}`);
  return res.data.data;
};

export default api;
