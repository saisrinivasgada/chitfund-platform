import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import Toast from '../ui/Toast';
import useToast from '../../hooks/useToast';
import { createContext, useContext } from 'react';

const ToastContext = createContext(null);
export const useToastContext = () => useContext(ToastContext);

export default function AppLayout() {
  const { isAuthenticated, user } = useAuth();
  const { toasts, toast, dismiss } = useToast();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'MEMBER') return <Navigate to="/member" replace />;

  return (
    <ToastContext.Provider value={toast}>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F8F9FB' }}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
        <Toast toasts={toasts} onDismiss={dismiss} />
      </div>
    </ToastContext.Provider>
  );
}
