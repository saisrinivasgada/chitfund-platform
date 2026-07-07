import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const idleTimer = useRef(null);
  const lastActivity = useRef(Date.now());

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
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
        // Timer fired early (browser throttled it) — reschedule for remaining time
        scheduleIdleCheck(logoutFn);
      }
    }, IDLE_TIMEOUT_MS);
  }, []);

  const resetIdleTimer = useCallback(() => {
    lastActivity.current = Date.now();
    scheduleIdleCheck(logout);
  }, [logout, scheduleIdleCheck]);

  // Start idle timer when user is logged in
  useEffect(() => {
    if (!token) return;
    resetIdleTimer();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));

    // When tab becomes visible again, check if 30 min has already elapsed
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastActivity.current;
        if (elapsed >= IDLE_TIMEOUT_MS) {
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

  function login(tokenValue, userData) {
    localStorage.setItem('token', tokenValue);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(tokenValue);
    setUser(userData);
  }

  // Patch specific fields in the stored user (e.g., clear mustChangePassword after password change)
  function updateUser(changes) {
    setUser((prev) => {
      const updated = { ...prev, ...changes };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, updateUser, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
