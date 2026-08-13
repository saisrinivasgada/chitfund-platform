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

const GLOW_ANIM = {
  success: 'toastGlowSuccess',
  error: 'toastGlowError',
  warning: 'toastGlowWarning',
};

function ToastItem({ toast, onDismiss }) {
  const Icon = ICONS[toast.type] ?? Info;
  const glowAnim = GLOW_ANIM[toast.type];
  return (
    <>
      {glowAnim && (
        <style>{`
          @keyframes toastGlowSuccess { 0%,100%{box-shadow:0 4px 14px 0 rgba(0,0,0,.10)} 30%{box-shadow:0 0 0 4px rgba(34,197,94,.25),0 4px 14px 0 rgba(34,197,94,.15)} }
          @keyframes toastGlowError   { 0%,100%{box-shadow:0 4px 14px 0 rgba(0,0,0,.10)} 30%{box-shadow:0 0 0 4px rgba(239,68,68,.25), 0 4px 14px 0 rgba(239,68,68,.15)} }
          @keyframes toastGlowWarning { 0%,100%{box-shadow:0 4px 14px 0 rgba(0,0,0,.10)} 30%{box-shadow:0 0 0 4px rgba(234,179, 8,.25),0 4px 14px 0 rgba(234,179,8,.15)} }
        `}</style>
      )}
      <div
        className={`flex items-start gap-3 px-4 py-3 rounded-lg border border-gray-200 border-l-4 min-w-[280px] max-w-sm ${COLORS[toast.type] ?? COLORS.info}`}
        style={glowAnim ? { animation: `${glowAnim} 0.7s ease-out` } : { boxShadow: '0 4px 14px 0 rgba(0,0,0,.10)' }}
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
    </>
  );
}

export default function Toast({ toasts, onDismiss }) {
  return toasts.length > 0 ? (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  ) : null;
}
