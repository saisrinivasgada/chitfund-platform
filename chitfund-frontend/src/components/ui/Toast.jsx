import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: 'border-l-green-500 bg-white',
  error: 'border-l-red-500 bg-white',
  warning: 'border-l-yellow-500 bg-white',
  info: 'border-l-blue-500 bg-white',
};

const ICON_COLORS = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-blue-500',
};

function ToastItem({ toast, onDismiss }) {
  const Icon = ICONS[toast.type] ?? Info;
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border border-gray-200 border-l-4 min-w-[280px] max-w-sm ${COLORS[toast.type] ?? COLORS.info}`}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${ICON_COLORS[toast.type] ?? 'text-blue-500'}`} />
      <p className="flex-1 text-sm text-gray-800">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function Toast({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
