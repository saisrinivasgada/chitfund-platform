import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function useInactivityLogout(timeoutMs = 30 * 60 * 1000) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef(null);

  useEffect(() => {
    function reset() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        logout();
        navigate('/session-expired', { replace: true });
      }, timeoutMs);
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [logout, navigate, timeoutMs]);
}
