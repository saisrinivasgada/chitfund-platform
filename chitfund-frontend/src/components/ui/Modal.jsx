import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children, size = 'md' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const maxW = {
    sm:  'max-w-sm',
    md:  'max-w-md',
    lg:  'max-w-lg',
    xl:  'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  }[size] ?? 'max-w-md';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full ${maxW} flex flex-col`}
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3
            className="text-lg font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer"
            style={{ color: '#9CA3AF' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; e.currentTarget.style.color = '#374151'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 max-h-[70vh]">{children}</div>
      </div>
    </div>
  );
}
