import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function useInactivityLogout(
  timeoutMs = 30 * 60 * 1000,
  onTimeout,
  redirectTo = '/session-expired',
) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    function reset() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (onTimeoutRef.current) onTimeoutRef.current();
        else logout();
        navigate(redirectTo, { replace: true });
      }, timeoutMs);
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [logout, navigate, redirectTo, timeoutMs]);
}
