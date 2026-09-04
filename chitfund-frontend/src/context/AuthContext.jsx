import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { setAuthToken, clearAuthToken, refreshSession } from '../services/api';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

const AuthContext = createContext(null);

function normalizeUser(userData) {
  if (!userData) return userData;
  if (userData.role === 'WORKER') return { ...userData, role: 'STAFF' };
  return userData;
}


export function AuthProvider({ children }) {
  const [isProxySession, setIsProxySession] = useState(() => !!sessionStorage.getItem('token'));
  // Token lives in memory only — never in localStorage (XSS protection)
  const [token, setToken]       = useState(null);
  const [user, setUser]         = useState(() => {
    try { return normalizeUser(JSON.parse(localStorage.getItem('user'))); } catch { return null; }
  });
  const [tenantId, setTenantId] = useState(() => localStorage.getItem('tenantId'));
  const [tenantSlug, setTenantSlug] = useState(() => localStorage.getItem('tenantSlug'));
  const [tenantName, setTenantName] = useState(() => localStorage.getItem('tenantName'));
  const [tenantPlan, setTenantPlan] = useState(() => localStorage.getItem('tenantPlan') ?? 'BASIC');
  const [tenantStatus, setTenantStatus] = useState(() => localStorage.getItem('tenantStatus') ?? 'ACTIVE');
  const [planExpiresAt, setPlanExpiresAt] = useState(() => localStorage.getItem('planExpiresAt') ?? null);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => localStorage.getItem('analyticsEnabled') !== 'false');
  // True while restoring session from HttpOnly refresh cookie on page load
  const [isRestoring, setIsRestoring] = useState(() => !!localStorage.getItem('user'));

  const idleTimer    = useRef(null);
  const lastActivity = useRef(Date.now());

  const logout = useCallback(() => {
    clearAuthToken();
    ['user','tenantId','tenantSlug','tenantName','tenantPlan','tenantStatus','planExpiresAt','analyticsEnabled']
      .forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
    sessionStorage.removeItem('token'); // clear proxy session token if any
    setToken(null);
    setUser(null);
    setTenantId(null);
    setTenantSlug(null);
    setTenantName(null);
    setTenantPlan('BASIC');
    setTenantStatus('ACTIVE');
    setPlanExpiresAt(null);
    setAnalyticsEnabled(true);
    setIsProxySession(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const scheduleIdleCheck = useCallback((logoutFn) => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= IDLE_TIMEOUT_MS) {
        logoutFn();
        window.location.href = '/login';
      } else {
        scheduleIdleCheck(logoutFn);
      }
    }, IDLE_TIMEOUT_MS);
  }, []);

  const resetIdleTimer = useCallback(() => {
    lastActivity.current = Date.now();
    scheduleIdleCheck(logout);
  }, [logout, scheduleIdleCheck]);

  // On mount: if localStorage has user info but no token in memory, restore via HttpOnly cookie
  useEffect(() => {
    if (!localStorage.getItem('user')) {
      setIsRestoring(false);
      return;
    }
    // Check for proxy session first — it already has a token in sessionStorage
    const proxyToken = sessionStorage.getItem('token');
    if (proxyToken) {
      setToken(proxyToken);
      setIsRestoring(false);
      return;
    }
    refreshSession()
      .then((auth) => {
        const accessToken = auth.accessToken ?? auth.token;
        setAuthToken(accessToken);
        setToken(accessToken);
      })
      .catch(() => {
        logout();
      })
      .finally(() => setIsRestoring(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;
    resetIdleTimer();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastActivity.current >= IDLE_TIMEOUT_MS) {
          logout();
          window.location.href = '/login';
        }
      }
    }

    // api.js fires this when a silent token refresh succeeds mid-request.
    // Update the in-memory token and reset the idle timer so the session stays alive.
    function handleTokenRefreshed(e) {
      setToken(e.detail.token);
      setAuthToken(e.detail.token);
      resetIdleTimer();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('auth:token-refreshed', handleTokenRefreshed);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed);
    };
  }, [token, resetIdleTimer, logout]);

  // Called after step 2 (select-tenant) with the full scoped AuthResponse.
  // Pass { proxy: true } for proxy sessions — writes to sessionStorage only so the
  // real session in other tabs (localStorage) is never touched.
  // For real sessions: token lives in memory only (setAuthToken), never in localStorage.
  function login(tokenValue, userData, tenantData = {}, { proxy = false } = {}) {
    const store = proxy ? sessionStorage : localStorage;
    if (!proxy) {
      // Real login: clear any leftover proxy state
      ['token','user','tenantId','tenantSlug','tenantName','tenantPlan','tenantStatus','planExpiresAt','analyticsEnabled']
        .forEach((k) => sessionStorage.removeItem(k));
      // Store token in memory only — HttpOnly cookie handles persistence
      setAuthToken(tokenValue);
    } else {
      // Proxy sessions: keep token in sessionStorage for tab isolation
      store.setItem('token', tokenValue);
    }
    const normalized = normalizeUser(userData);
    store.setItem('user', JSON.stringify(normalized));
    if (tenantData.tenantId)     { store.setItem('tenantId',     tenantData.tenantId);     setTenantId(tenantData.tenantId); }
    if (tenantData.tenantSlug)   { store.setItem('tenantSlug',   tenantData.tenantSlug);   setTenantSlug(tenantData.tenantSlug); }
    if (tenantData.tenantName)   { store.setItem('tenantName',   tenantData.tenantName);   setTenantName(tenantData.tenantName); }
    if (tenantData.tenantPlan)   { store.setItem('tenantPlan',   tenantData.tenantPlan);   setTenantPlan(tenantData.tenantPlan); }
    if (tenantData.tenantStatus) { store.setItem('tenantStatus', tenantData.tenantStatus); setTenantStatus(tenantData.tenantStatus); }
    if (tenantData.planExpiresAt !== undefined) {
      if (tenantData.planExpiresAt) {
        store.setItem('planExpiresAt', tenantData.planExpiresAt);
        setPlanExpiresAt(tenantData.planExpiresAt);
      } else {
        store.removeItem('planExpiresAt');
        setPlanExpiresAt(null);
      }
    }
    if (tenantData.analyticsEnabled !== undefined) {
      store.setItem('analyticsEnabled', String(tenantData.analyticsEnabled));
      setAnalyticsEnabled(tenantData.analyticsEnabled);
    }
    setIsProxySession(proxy);
    setToken(tokenValue);
    setUser(normalized);
  }

  function updateUser(changes) {
    setUser((prev) => {
      const updated = { ...prev, ...changes };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{
      token, user, tenantId, tenantSlug, tenantName, tenantPlan, tenantStatus, planExpiresAt, analyticsEnabled,
      login, logout, updateUser,
      isAuthenticated: !!token,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      isProxySession,
      isRestoring,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
