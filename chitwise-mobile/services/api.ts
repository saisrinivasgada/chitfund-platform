import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ── Change this to your EC2 host in production ──────────────────────────────
// For local dev: use your Mac's LAN IP (not localhost — device can't reach it)
export const API_BASE_URL = 'http://192.168.1.100:8080/api'; // update with your actual IP

const api = axios.create({ baseURL: API_BASE_URL, timeout: 15_000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('chitwise_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  userId: string;
  username: string;
  fullName: string;
  role: string;
}

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const res = await api.post('/auth/login', { username, password });
  return res.data.data ?? res.data;
};

// ── Chits ─────────────────────────────────────────────────────────────────────

export const getMyChits = async () => {
  const res = await api.get('/chits/mine');
  return res.data.data ?? res.data;
};

export const getChitById = async (chitId: string) => {
  const res = await api.get(`/chits/${chitId}`);
  return res.data.data ?? res.data;
};

export const getChits = async () => {
  const res = await api.get('/chits');
  return res.data.data ?? res.data;
};

// ── Members ───────────────────────────────────────────────────────────────────

export const getMembers = async () => {
  const res = await api.get('/members');
  return res.data.data ?? res.data;
};

export const getMemberById = async (memberId: string) => {
  const res = await api.get(`/members/${memberId}`);
  return res.data.data ?? res.data;
};

export const getMemberBalance = async (memberId: string, chitId: string) => {
  const res = await api.get('/payments/balance', { params: { memberId, chitId } });
  return res.data.data ?? res.data;
};

// ── Cash Requests ─────────────────────────────────────────────────────────────

export const getMyRequests = async () => {
  const res = await api.get('/payments/requests/my-requests');
  return res.data.data ?? res.data;
};

export const createCashRequest = async (chitId: string, requestedAmount: number, notes?: string) => {
  const res = await api.post('/payments/requests', { chitId, requestedAmount, notes });
  return res.data.data ?? res.data;
};

export const getActiveCashRequests = async () => {
  const res = await api.get('/payments/requests/active');
  return res.data.data ?? res.data;
};

export const assignWorkerToRequest = async (requestId: string, workerId: string, adminNotes?: string) => {
  const res = await api.patch(`/payments/requests/${requestId}/assign`, { workerId, adminNotes });
  return res.data.data ?? res.data;
};

export const collectForRequest = async (requestId: string) => {
  const res = await api.post(`/payments/requests/${requestId}/collect`);
  return res.data.data ?? res.data;
};

export const voidCashPickup = async (requestId: string, reason: string) => {
  const res = await api.patch(`/payments/requests/${requestId}/void-pickup`, null, { params: { reason } });
  return res.data.data ?? res.data;
};

export const getCashRequestAuditLog = async (requestId: string) => {
  const res = await api.get(`/payments/requests/${requestId}/audit`);
  return res.data.data ?? res.data;
};

export const cancelCashRequest = async (requestId: string, reason?: string) => {
  const params = reason ? { reason } : {};
  const res = await api.patch(`/payments/requests/${requestId}/cancel`, null, { params });
  return res.data.data ?? res.data;
};

// ── Worker ────────────────────────────────────────────────────────────────────

export const getMyAssignedRequests = async () => {
  const res = await api.get('/payments/requests/mine');
  return res.data.data ?? res.data;
};

export const getMyWorkerHistory = async () => {
  const res = await api.get('/payments/requests/mine/history');
  return res.data.data ?? res.data;
};

export const markPickedUp = async (requestId: string) => {
  const res = await api.patch(`/payments/requests/${requestId}/pickup`);
  return res.data.data ?? res.data;
};

export const rescheduleRequest = async (requestId: string, scheduledFor: string) => {
  const res = await api.patch(`/payments/requests/${requestId}/reschedule`, null, { params: { scheduledFor } });
  return res.data.data ?? res.data;
};

export const cancelByWorker = async (requestId: string, reason?: string) => {
  const res = await api.patch(`/payments/requests/${requestId}/cancel/worker`, null, { params: { reason } });
  return res.data.data ?? res.data;
};

// ── Payments & History ────────────────────────────────────────────────────────

export const getPaymentHistory = async (chitId?: string, memberId?: string) => {
  const res = await api.get('/payments/batches', { params: { chitId, memberId } });
  return res.data.data ?? res.data;
};

export const getDashboardStats = async () => {
  const res = await api.get('/chits/dashboard');
  return res.data.data ?? res.data;
};

// ── Notifications ─────────────────────────────────────────────────────────────

export const getMyNotifications = async () => {
  const res = await api.get('/notifications/mine');
  return res.data.data ?? res.data;
};

export const markNotificationRead = async (id: string) => {
  const res = await api.patch(`/notifications/${id}/read`);
  return res.data.data ?? res.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.patch('/notifications/read-all');
  return res.data.data ?? res.data;
};

// ── Staff ─────────────────────────────────────────────────────────────────────

export const listStaff = async () => {
  const res = await api.get('/users/staff');
  return res.data.data ?? res.data;
};

export default api;
