const VARIANTS = {
  success: 'bg-green-100 text-green-700',
  danger: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
  default: 'bg-gray-100 text-gray-600',
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  pending: 'bg-yellow-100 text-yellow-700',
};

export default function Badge({ children, variant = 'default' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${VARIANTS[variant] ?? VARIANTS.default}`}
    >
      {children}
    </span>
  );
}

export function statusBadge(status) {
  if (!status) return 'default';
  const s = status.toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'completed') return 'completed';
  if (s === 'paused') return 'paused';
  if (s === 'draft') return 'draft';
  if (s === 'pending') return 'pending';
  if (s === 'inactive' || s === 'suspended' || s === 'blacklisted') return 'danger';
  if (s === 'disbursed') return 'success';
  if (s === 'cancelled' || s === 'canceled') return 'danger';
  return 'default';
}
