import { Loader2 } from 'lucide-react';

const BASE = [
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg',
  'transition-colors duration-150 cursor-pointer',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'focus:outline-none focus:ring-2 focus:ring-offset-2',
].join(' ');

const VARIANTS = {
  primary:   'bg-[#1E3A5F] text-white hover:bg-[#162d4a] focus:ring-[#1E3A5F] shadow-sm hover:shadow-md',
  secondary: 'bg-white text-[#1E3A5F] border-2 border-[#1E3A5F] hover:bg-[#EFF3F8] focus:ring-[#1E3A5F]',
  danger:    'bg-[#DC2626] text-white hover:bg-[#b91c1c] focus:ring-[#DC2626] shadow-sm hover:shadow-md',
  ghost:     'bg-transparent text-[#1E3A5F] hover:bg-[#EFF3F8] focus:ring-[#1E3A5F]',
  warning:   'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500 shadow-sm',
  success:   'bg-[#16A34A] text-white hover:bg-[#15803d] focus:ring-[#16A34A] shadow-sm hover:shadow-md',
  muted:     'bg-gray-100 text-gray-600 hover:bg-gray-200 focus:ring-gray-300',
};

const SIZES = {
  xs: 'px-2.5 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  ...props
}) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant] ?? VARIANTS.primary} ${SIZES[size] ?? SIZES.md} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin flex-shrink-0" />}
      {children}
    </button>
  );
}
