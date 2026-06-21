import { useState, useEffect } from 'react';

const KEY = 'dashboard_amounts_hidden';

export function useHiddenAmounts() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
  });

  // Sync across tabs and other page instances via storage event
  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setHidden(e.newValue === 'true');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function toggle() {
    setHidden((h) => {
      const next = !h;
      try { localStorage.setItem(KEY, String(next)); } catch {}
      // Dispatch so other same-page components sync immediately
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: String(next) }));
      return next;
    });
  }

  return { hidden, toggle };
}
