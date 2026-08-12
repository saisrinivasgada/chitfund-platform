import { useState, useCallback } from 'react';

let nextId = 0;

export default function useToast() {
  const [toasts, setToasts] = useState([]);
  const [centerFlash, setCenterFlash] = useState(null); // { type, id }

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type = 'info') => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
    // Center flash for success/error — brief visual confirmation
    if (type === 'success' || type === 'error' || type === 'warning') {
      setCenterFlash({ type, id });
      setTimeout(() => setCenterFlash(null), 1200);
    }
  }, [dismiss]);

  const toast = {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
    info: (msg) => show(msg, 'info'),
    warning: (msg) => show(msg, 'warning'),
  };

  return { toasts, toast, dismiss, centerFlash };
}
