import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { setAuthToken, clearAuthToken, refreshSession, getMyEffectiveLimits } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';
import { ACTIVE_ACCOUNT_KEY, activeAccountScope, accountScope, lockAccount, rememberAccount, refreshAccount } from '../offline/accountClient';
import { readRow } from '../offline/storage';
import { inspectSignOut, completeVoluntarySignOut } from '../offline/signOut';
import SignOutDialog from '../offline/SignOutDialog';
import OfflineConnectionGate from '../offline/OfflineConnectionGate';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

const AuthContext = createContext(null);

function normalizeUser(userData) {
  if (!userData) return userData;
  return { ...userData, fullName: userData.fullName ?? userData.name ?? userData.username,
    role: userData.role === 'WORKER' ? 'STAFF' : userData.role };
}


export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [connectionRequired, setConnectionRequired] = useState(null);
  const [offlineSession, setOfflineSession] = useState(false);
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
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => localStorage.getItem('analyticsEnabled') === 'true');
  const [chatEnabled, setChatEnabled] = useState(() => localStorage.getItem('chatEnabled') === 'true');
  const [settlementEnabled, setSettlementEnabled] = useState(() => localStorage.getItem('settlementEnabled') === 'true');
  const [adminPhone, setAdminPhone] = useState(() => localStorage.getItem('adminPhone') ?? null);
  const [adminEmail, setAdminEmail] = useState(() => localStorage.getItem('adminEmail') ?? null);
  // True while restoring session from HttpOnly refresh cookie on page load
  const [isRestoring, setIsRestoring] = useState(() => !!localStorage.getItem('user'));

  const idleTimer    = useRef(null);
  const lastActivity = useRef(Date.now());
  const [signOutRequest, setSignOutRequest] = useState(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const pendingSignOut = useRef(null);

  const logout = useCallback(() => {
    const scope = !sessionStorage.getItem('token') ? activeAccountScope() : null;
    if (scope) {
      lockAccount(scope).then(() => readRow('accounts', scope)).then((account) => {
        if (account?.browserAccountId) return fetch(`/api/auth/accounts/${account.browserAccountId}/logout`, {
          method: 'POST', credentials: 'include', headers: { 'X-Client-Source': 'WEB' },
        });
      }).catch(() => {});
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    }
    setConnectionRequired(null);
    setOfflineSession(false);
    queryClient.clear();
    clearAuthToken();
    ['user','tenantId','tenantSlug','tenantName','tenantPlan','tenantStatus','planExpiresAt','analyticsEnabled','chatEnabled','settlementEnabled','adminPhone','adminEmail']
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
    setAnalyticsEnabled(false);
    setChatEnabled(false);
    setSettlementEnabled(false);
    setAdminPhone(null);
    setAdminEmail(null);
    setIsProxySession(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, [queryClient]);

  const requestLogout = useCallback((options = {}) => {
    if (pendingSignOut.current) return pendingSignOut.current.promise;
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    pendingSignOut.current = { promise, resolve };
    const scope = !sessionStorage.getItem('token') ? activeAccountScope() : null;
    inspectSignOut(scope, options.all).then((selection) => {
      setSignOutError(''); setSignOutRequest({ selection, scope, all: !!options.all });
    }).catch(() => {
      setSignOutError('Local payment storage could not be checked. Please try again.');
      setSignOutRequest({ selection: { accounts: [], scopes: [], count: 0 }, scope, unavailable: true });
    });
    return promise;
  }, []);

  const cancelSignOut = () => {
    if (signOutBusy) return;
    setSignOutRequest(null); pendingSignOut.current?.resolve(false); pendingSignOut.current = null;
  };
  const confirmSignOut = async () => {
    if (signOutBusy || signOutRequest.unavailable) return;
    setSignOutBusy(true); setSignOutError('');
    try {
      await completeVoluntarySignOut(signOutRequest.selection);
      const active = activeAccountScope();
      if (!signOutRequest.scope || active === signOutRequest.scope || signOutRequest.selection.scopes.includes(active)) logout();
      setSignOutRequest(null); pendingSignOut.current?.resolve(true); pendingSignOut.current = null;
    } catch {
      setSignOutError('Could not update local payment storage. Please try again.');
    } finally { setSignOutBusy(false); }
  };

  useEffect(() => {
    const inspect = async (message) => {
      const scope = message.scope;
      if (!message.sessionInvalid || activeAccountScope() !== scope) return;
      const account = await readRow('accounts', scope).catch(() => null);
      if (activeAccountScope() === scope && !account?.sessionValid) logout();
    };
    const onInvalid = (event) => { inspect({ ...event.detail, sessionInvalid: true }).catch(() => {}); };
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('chitwise-offline') : null;
    if (channel) channel.onmessage = (event) => { inspect(event.data).catch(() => {}); };
    window.addEventListener('auth:account-invalid', onInvalid);
    return () => { channel?.close(); window.removeEventListener('auth:account-invalid', onInvalid); };
  }, [logout]);

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

  const applyEffectiveLimits = useCallback((limits) => {
    if (!limits) return;
    const store = isProxySession ? sessionStorage : localStorage;
    const nextPlan = limits.plan ?? 'BASIC';
    const nextStatus = limits.tenantStatus ?? 'ACTIVE';
    const nextExpiry = limits.planExpiresAt ?? null;
    const nextAnalytics = limits.analyticsEnabled === true;
    const nextChat = limits.chatEnabled === true;
    const nextSettlement = limits.settlementEnabled === true;

    store.setItem('tenantPlan', nextPlan);
    store.setItem('tenantStatus', nextStatus);
    if (nextExpiry) store.setItem('planExpiresAt', nextExpiry);
    else store.removeItem('planExpiresAt');
    store.setItem('analyticsEnabled', String(nextAnalytics));
    store.setItem('chatEnabled', String(nextChat));
    store.setItem('settlementEnabled', String(nextSettlement));

    setTenantPlan(nextPlan);
    setTenantStatus(nextStatus);
    setPlanExpiresAt(nextExpiry);
    setAnalyticsEnabled(nextAnalytics);
    setChatEnabled(nextChat);
    setSettlementEnabled(nextSettlement);
  }, [isProxySession]);

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
    const startingScope = activeAccountScope();
    refreshSession()
      .then((auth) => {
        if (activeAccountScope() !== startingScope) return;
        const accessToken = auth.accessToken ?? auth.token;
        if (auth.tenant) {
          login(accessToken, auth.user, tenantSessionData(auth.tenant));
        } else {
          setAuthToken(accessToken);
          setToken(accessToken);
        }
      })
      .catch(async (error) => {
        if (activeAccountScope() !== startingScope) return;
        if (!error.status || error.status >= 500) {
          const account = startingScope ? await readRow('accounts', startingScope).catch(() => null) : null;
          if (account?.sessionValid) {
            if (account.offlineAccess?.enabled) login(null, account.user, account.tenant, { offline: true });
            else setConnectionRequired(account);
            return;
          }
        }
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
      const auth = e.detail.auth;
      if (auth?.tenant) login(e.detail.token, auth.user, tenantSessionData(auth.tenant));
      else {
        setToken(e.detail.token);
        setAuthToken(e.detail.token);
      }
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

  // Plan changes can occur while a user remains signed in. Refresh successful
  // entitlement reads without treating a transient outage as an authorization
  // grant or forced logout; every protected API remains authoritative.
  useEffect(() => {
    if (!token || !tenantId) return;
    let cancelled = false;
    const refreshEntitlements = () => getMyEffectiveLimits()
      .then((limits) => { if (!cancelled) applyEffectiveLimits(limits); })
      .catch(() => {});
    refreshEntitlements();
    const timer = window.setInterval(refreshEntitlements, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshEntitlements();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, tenantId, applyEffectiveLimits]);

  // Called after step 2 (select-tenant) with the full scoped AuthResponse.
  // Pass { proxy: true } for proxy sessions — writes to sessionStorage only so the
  // real session in other tabs (localStorage) is never touched.
  // For real sessions: token lives in memory only (setAuthToken), never in localStorage.
  function login(tokenValue, userData, tenantData = {}, { proxy = false, offline = false } = {}) {
    setConnectionRequired(null);
    const normalized = normalizeUser({ ...userData, role: tenantData.role ?? userData.role });
    const scope = !proxy ? accountScope(normalized, tenantData.tenantId) : null;
    if (!proxy && scope !== activeAccountScope()) queryClient.clear();
    if (scope && offline) localStorage.setItem(ACTIVE_ACCOUNT_KEY, scope);
    if (scope && !offline) rememberAccount(normalized, tenantData, tokenValue).catch(() => {});
    setOfflineSession(offline);
    const store = proxy ? sessionStorage : localStorage;
    if (!proxy) {
      // Real login: clear any leftover proxy state
      ['token','user','tenantId','tenantSlug','tenantName','tenantPlan','tenantStatus','planExpiresAt','analyticsEnabled','chatEnabled','settlementEnabled','adminPhone','adminEmail']
        .forEach((k) => sessionStorage.removeItem(k));
      // Store token in memory only — HttpOnly cookie handles persistence
      setAuthToken(tokenValue);
    } else {
      // Proxy sessions: keep token in sessionStorage for tab isolation
      store.setItem('token', tokenValue);
    }
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
    if (tenantData.chatEnabled !== undefined) {
      store.setItem('chatEnabled', String(tenantData.chatEnabled));
      setChatEnabled(tenantData.chatEnabled);
    }
    if (tenantData.settlementEnabled !== undefined) {
      store.setItem('settlementEnabled', String(tenantData.settlementEnabled));
      setSettlementEnabled(tenantData.settlementEnabled);
    }
    if (tenantData.adminPhone !== undefined) {
      if (tenantData.adminPhone) { store.setItem('adminPhone', tenantData.adminPhone); setAdminPhone(tenantData.adminPhone); }
      else { store.removeItem('adminPhone'); setAdminPhone(null); }
    }
    if (tenantData.adminEmail !== undefined) {
      if (tenantData.adminEmail) { store.setItem('adminEmail', tenantData.adminEmail); setAdminEmail(tenantData.adminEmail); }
      else { store.removeItem('adminEmail'); setAdminEmail(null); }
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
      token, user, tenantId, tenantSlug, tenantName, tenantPlan, tenantStatus, planExpiresAt, analyticsEnabled, chatEnabled, settlementEnabled, adminPhone, adminEmail,
      login, logout, requestLogout, updateUser,
      switchToSavedAccount: async (scope) => {
        try {
          if (!navigator.onLine) throw new Error('Offline');
          const auth = await refreshAccount(scope);
          login(auth.accessToken, auth.user, tenantSessionData(auth.tenant));
        } catch (error) {
          if (error.status && error.status < 500) throw error;
          const saved = await readRow('accounts', scope);
          if (!saved?.sessionValid || !saved.offlineAccess?.enabled || accountScope(saved.user, saved.tenant.tenantId) !== scope) throw error;
          login(null, saved.user, saved.tenant, { offline: true });
        }
      },
      startAccountLogin: () => {
        // Keep other saved sessions valid so their pending payments can sync.
        clearAuthToken(); queryClient.clear();
        setToken(null); setUser(null); setOfflineSession(false);
        localStorage.removeItem('user'); localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      },
      refreshEntitlements: async () => applyEffectiveLimits(await getMyEffectiveLimits()),
      isAuthenticated: (!!token || offlineSession) && !!user,
      offlineSession,
      connectionRequired,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
      isProxySession,
      isRestoring,
    }}>
      <OfflineConnectionGate>{children}</OfflineConnectionGate>
      {signOutRequest && <SignOutDialog selection={signOutRequest.selection} all={signOutRequest.all}
        busy={signOutBusy} unavailable={signOutRequest.unavailable} error={signOutError} onConfirm={confirmSignOut} onCancel={cancelSignOut} />}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

function tenantSessionData(tenant) {
  return {
    tenantId: tenant.tenantId,
    role: tenant.role,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tenantPlan: tenant.plan ?? 'BASIC',
    tenantStatus: tenant.status ?? 'ACTIVE',
    planExpiresAt: tenant.planExpiresAt ?? null,
    analyticsEnabled: tenant.analyticsEnabled === true,
    chatEnabled: tenant.chatEnabled === true,
    settlementEnabled: tenant.settlementEnabled === true,
    offlineEnabled: typeof tenant.offlineEnabled === 'boolean' ? tenant.offlineEnabled : undefined,
    adminPhone: tenant.adminPhone ?? null,
    adminEmail: tenant.adminEmail ?? null,
  };
}
