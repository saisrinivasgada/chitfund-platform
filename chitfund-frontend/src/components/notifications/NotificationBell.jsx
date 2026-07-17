import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, X, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../services/api';
import { useNotifSocket } from '../../hooks/useNotifSocket';

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotifItem({ n, onRead, onNavigate }) {
  const isUnread = !n.read;
  const hasLink = !!n.link;
  return (
    <div
      onClick={hasLink ? () => onNavigate(n) : (isUnread ? () => onRead(n.id) : undefined)}
      className={`px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${
        isUnread ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-gray-50'
      } ${(hasLink || isUnread) ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full" style={{
          backgroundColor: isUnread ? '#1E3A5F' : 'transparent',
          border: isUnread ? 'none' : '1.5px solid #D1D5DB',
        }} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${isUnread ? 'font-semibold text-gray-900' : 'font-normal text-gray-500'}`}>
            {n.title}
          </p>
          <p className={`text-xs mt-0.5 ${isUnread ? 'text-gray-600' : 'text-gray-400'}`}>
            {n.message}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
        </div>

        {isUnread && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(n.id); }}
            className="p-1 text-gray-400 hover:text-green-600 rounded transition-colors cursor-pointer flex-shrink-0 mt-0.5"
            title="Mark read without navigating"
          >
            <CheckCheck size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notif-unread'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000, // fallback poll — WebSocket provides instant updates when available
  });

  useNotifSocket(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['notif-unread'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  }, [qc]));

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: getNotifications,
    enabled: open,
  });

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
    },
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleNavigate = useCallback((n) => {
    if (n.link) navigate(n.link);
    if (!n.read) readMutation.mutate(n.id);
    setOpen(false);
  }, [navigate, readMutation]);

  const unread = Math.min(unreadCount, 99);

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-pointer ${
          open ? 'bg-[#EFF3F8] text-[#1E3A5F]' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-800'
        }`}
        title="Notifications"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold leading-none"
            style={{ backgroundColor: '#D4A017' }}
          >
            {unread}
          </span>
        )}
      </button>

      {/* Dropdown panel — opens rightward since the bell lives in the left sidebar */}
      {open && (
        <div
          className="absolute left-0 mt-2 z-[200] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ width: '340px', top: '100%' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#1E3A5F' }}>
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-white/70" />
              <span className="text-sm font-semibold text-white">Notifications</span>
              {unread > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-white/20 text-white">
                  {unread} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => readAllMutation.mutate()}
                  disabled={readAllMutation.isPending}
                  className="text-xs text-white/70 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10 cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-white/60 hover:text-white rounded transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell size={28} className="mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotifItem
                  key={n.id}
                  n={n}
                  onRead={(id) => readMutation.mutate(id)}
                  onNavigate={handleNavigate}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
