import { useState } from 'react';
import { AlertTriangle, Trash2, Info, ShieldAlert } from 'lucide-react';
import Button from './Button';
import FormField, { Input } from './FormField';

const VARIANT_CONFIG = {
  warning: {
    icon: AlertTriangle,
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    confirmVariant: 'warning',
    headerBorder: '#FEF3C7',
  },
  danger: {
    icon: ShieldAlert,
    iconBg: '#FEE2E2',
    iconColor: '#DC2626',
    confirmVariant: 'danger',
    headerBorder: '#FEE2E2',
  },
  primary: {
    icon: Info,
    iconBg: '#EFF3F8',
    iconColor: '#1E3A5F',
    confirmVariant: 'primary',
    headerBorder: '#EFF3F8',
  },
};

/**
 * ConfirmDialog — clean, spacious confirmation for mildly risky actions.
 *
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div
          className="rounded-t-2xl px-6 py-5 flex items-start gap-4"
          style={{ backgroundColor: cfg.iconBg }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          >
            <Icon size={22} style={{ color: cfg.iconColor }} />
          </div>
          <div className="pt-0.5">
            <h3
              className="text-base font-bold mb-1"
              style={{ color: '#111827', fontFamily: 'Merriweather, serif' }}
            >
              {title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#4B5563' }}>
              {description}
            </p>
          </div>
        </div>

        {children && (
          <div className="px-6 pt-4">{children}</div>
        )}

        <div className="px-6 py-5 flex items-center justify-end gap-3">
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
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Red top band */}
        <div className="rounded-t-2xl px-6 py-5 flex items-start gap-4 bg-red-50">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          >
            <Trash2 size={22} className="text-red-600" />
          </div>
          <div className="pt-0.5">
            <h3
              className="text-base font-bold mb-1 text-gray-900"
              style={{ fontFamily: 'Merriweather, serif' }}
            >
              {title}
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">{description}</p>
          </div>
        </div>

        {/* Type-to-confirm input */}
        <div className="px-6 pt-5 pb-2">
          <FormField label={`Type "${confirmWord}" to confirm`} required>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              autoFocus
            />
          </FormField>
        </div>

        {/* Actions */}
        <div className="px-6 py-5 flex items-center justify-end gap-3">
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
      </div>
    </div>
  );
}
