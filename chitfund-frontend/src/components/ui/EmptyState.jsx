import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({ icon: Icon = Inbox, title = 'No data', message, action, onAction }) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-center px-6">
      <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center">
        <Icon size={22} className="text-gray-400" />
      </div>
      <div>
        <h4 className="text-base font-semibold text-gray-700">{title}</h4>
        {message && <p className="text-sm text-gray-400 max-w-xs mt-1">{message}</p>}
      </div>
      {action && onAction && (
        <Button onClick={onAction} size="sm">{action}</Button>
      )}
    </div>
  );
}
