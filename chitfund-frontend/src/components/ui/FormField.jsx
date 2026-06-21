import { Calendar } from 'lucide-react';

export default function FormField({ label, error, required, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-700 mb-0">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F] text-gray-900 placeholder-gray-400 transition-colors disabled:bg-gray-50 disabled:text-gray-500';

export function Input({ className = '', ...props }) {
  return <input className={`${INPUT_CLASS} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${INPUT_CLASS} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={`${INPUT_CLASS} resize-none ${className}`}
      rows={3}
      {...props}
    />
  );
}

/**
 * DateInput — wraps <input type="date"> with a visible calendar icon.
 * The icon is a click target that opens the picker (via the hidden input's showPicker()).
 */
export function DateInput({ className = '', id, ...props }) {
  const innerId = id ?? `date-${Math.random().toString(36).slice(2)}`;
  return (
    <div className="relative">
      <input
        id={innerId}
        type="date"
        className={`${INPUT_CLASS} pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer ${className}`}
        {...props}
      />
      <label
        htmlFor={innerId}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1E3A5F] cursor-pointer pointer-events-none"
        aria-hidden="true"
      >
        <Calendar size={16} />
      </label>
    </div>
  );
}
