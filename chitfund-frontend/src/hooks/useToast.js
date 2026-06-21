import { useState, useCallback } from 'react';

let nextId = 0;

export default function useToast() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type = 'info') => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const toast = {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
    info: (msg) => show(msg, 'info'),
    warning: (msg) => show(msg, 'warning'),
  };

  return { toasts, toast, dismiss };
}
