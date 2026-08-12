import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

const AuthContext = createContext(null);

function normalizeUser(userData) {
  if (!userData) return userData;
  if (userData.role === 'WORKER') return { ...userData, role: 'STAFF' };
  return userData;
}

// Proxy sessions use sessionStorage (tab-isolated); real sessions use localStorage.
// sessionStorage takes priority if present so the main tab's localStorage is never touched.
function readStore(key, fallback = null) {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key) ?? fallback;
}

export function AuthProvider({ children }) {
  const [isProxySession, setIsProxySession] = useState(() => !!sessionStorage.getItem('token'));
  const [token, setToken]       = useState(() => readStore('token'));
  const [user, setUser]         = useState(() => {
    try { return normalizeUser(JSON.parse(readStore('user'))); } catch { return null; }
  });
  const [tenantId, setTenantId] = useState(() => readStore('tenantId'));
  const [tenantSlug, setTenantSlug] = useState(() => readStore('tenantSlug'));
  const [tenantName, setTenantName] = useState(() => readStore('tenantName'));
  const [tenantPlan, setTenantPlan] = useState(() => readStore('tenantPlan') ?? 'BASIC');
  const [tenantStatus, setTenantStatus] = useState(() => readStore('tenantStatus') ?? 'ACTIVE');
  const [planExpiresAt, setPlanExpiresAt] = useState(() => readStore('planExpiresAt') ?? null);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => readStore('analyticsEnabled') !== 'false');

  const idleTimer    = useRef(null);
  const lastActivity = useRef(Date.now());

  const logout = useCallback(() => {
    ['token','user','tenantId','tenantSlug','tenantName','tenantPlan','tenantStatus','planExpiresAt','analyticsEnabled']
      .forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
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
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token, resetIdleTimer, logout]);

  // Called after step 2 (select-tenant) with the full scoped AuthResponse.
  // Pass { proxy: true } for proxy sessions — writes to sessionStorage only so the
  // real session in other tabs (localStorage) is never touched.
  function login(tokenValue, userData, tenantData = {}, { proxy = false } = {}) {
    const store = proxy ? sessionStorage : localStorage;
    if (!proxy) {
      // Real login: clear any leftover proxy state
      ['token','user','tenantId','tenantSlug','tenantName','tenantPlan','tenantStatus','planExpiresAt','analyticsEnabled']
        .forEach((k) => sessionStorage.removeItem(k));
    }
    const normalized = normalizeUser(userData);
    store.setItem('token', tokenValue);
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
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
