import { useState, useEffect, useCallback } from 'react';

const KEY = 'dashboard_amounts_hidden';

// Module-level state so all hook instances on the same page stay in sync
// without needing StorageEvent tricks inside a React state updater.
const _listeners = new Set();
let _current = (() => {
  try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
})();

function _broadcast(next) {
  _current = next;
  try { localStorage.setItem(KEY, String(next)); } catch { /* ignore storage errors */ }
  _listeners.forEach((fn) => fn(next));
}

export function useHiddenAmounts() {
  const [hidden, setHidden] = useState(_current);

  useEffect(() => {
    // Same-page sync
    _listeners.add(setHidden);

    // Cross-tab sync (real native storage event from another tab)
    function onStorage(e) {
      if (e.isTrusted && e.key === KEY) {
        _broadcast(e.newValue === 'true');
      }
    }
    window.addEventListener('storage', onStorage);

    return () => {
      _listeners.delete(setHidden);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    _broadcast(!_current);
  }, []);

  return { hidden, toggle };
}
