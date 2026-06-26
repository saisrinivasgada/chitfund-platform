import { useState } from 'react';
import { AlertTriangle, Trash2, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';
import Button from './Button';
import FormField, { Input } from './FormField';

const VARIANT_CONFIG = {
  warning: {
    icon: AlertTriangle,
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    confirmVariant: 'warning',
  },
  danger: {
    icon: ShieldAlert,
    iconBg: '#FEE2E2',
    iconColor: '#DC2626',
    confirmVariant: 'danger',
  },
  primary: {
    icon: Info,
    iconBg: '#EFF3F8',
    iconColor: '#1E3A5F',
    confirmVariant: 'primary',
  },
  success: {
    icon: CheckCircle2,
    iconBg: '#F0FDF4',
    iconColor: '#16A34A',
    confirmVariant: 'success',
  },
};

// Shared bottom-sheet / centred-dialog shell
function DialogShell({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 lg:p-6">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Mobile: bottom sheet | Tablet+: centred card */}
      <div className="relative bg-white w-full rounded-t-2xl sm:rounded-2xl sm:shadow-2xl sm:max-w-md overflow-hidden">
        {/* Drag pill — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * ConfirmDialog — clean, spacious confirmation for mildly risky actions.
 * variant: 'warning' (amber) | 'danger' (red) | 'primary' (blue/navy)
 */
export function ConfirmDialog({
  title,
  description,
  actionLabel,
  variant = 'warning',
  loading = false,
  onConfirm,
  onClose,
  children,
  confirmDisabled = false,
}) {
  const cfg = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.warning;
  const Icon = cfg.icon;

  return (
    <DialogShell onClose={onClose}>
      <div
        className="rounded-t-2xl sm:rounded-t-2xl px-5 sm:px-6 py-5 flex items-start gap-4"
        style={{ backgroundColor: cfg.iconBg }}
      >
        <div
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        >
          <Icon size={20} style={{ color: cfg.iconColor }} />
        </div>
        <div className="pt-0.5 min-w-0">
          <h3
            className="text-base font-bold mb-1 text-gray-900"
            style={{ fontFamily: 'Merriweather, serif' }}
          >
            {title}
          </h3>
          <p className="text-sm leading-relaxed text-gray-600">{description}</p>
        </div>
      </div>

      {children && (
        <div className="px-5 sm:px-6 pt-4">{children}</div>
      )}

      <div className="px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-end gap-3">
        <Button variant="muted" onClick={onClose} disabled={loading} size="md">
          Cancel
        </Button>
        <Button
          variant={cfg.confirmVariant}
          onClick={onConfirm}
          loading={loading}
          disabled={confirmDisabled}
          size="md"
        >
          {actionLabel}
        </Button>
      </div>
    </DialogShell>
  );
}

/**
 * DestructiveDialog — requires typing a confirmation word before proceeding.
 * For permanent, hard-to-reverse operations.
 */
export function DestructiveDialog({
  title,
  description,
  confirmWord = 'DELETE',
  actionLabel = 'Delete',
  loading = false,
  onConfirm,
  onClose,
}) {
  const [typed, setTyped] = useState('');
  const ready = typed === confirmWord;

  return (
    <DialogShell onClose={onClose}>
      <div className="rounded-t-2xl px-5 sm:px-6 py-5 flex items-start gap-4 bg-red-50">
        <div
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        >
          <Trash2 size={20} className="text-red-600" />
        </div>
        <div className="pt-0.5 min-w-0">
          <h3
            className="text-base font-bold mb-1 text-gray-900"
            style={{ fontFamily: 'Merriweather, serif' }}
          >
            {title}
          </h3>
          <p className="text-sm leading-relaxed text-gray-600">{description}</p>
        </div>
      </div>

      <div className="px-5 sm:px-6 pt-5 pb-2">
        <FormField label={`Type "${confirmWord}" to confirm`} required>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            autoFocus
          />
        </FormField>
      </div>

      <div className="px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-end gap-3">
        <Button variant="muted" onClick={onClose} disabled={loading} size="md">
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={onConfirm}
          disabled={!ready}
          loading={loading}
          size="md"
        >
          {actionLabel}
        </Button>
      </div>
    </DialogShell>
  );
}
