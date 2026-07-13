import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMe, mobileLookup, loginByMobile, getTeamNotes, createTeamNote, updateTeamNote, deleteTeamNote } from '../../services/api';
import NotificationBell from '../notifications/NotificationBell';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Input } from '../ui/FormField';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CreditCard,
  Banknote,
  Shuffle,
  BarChart2,
  LogOut,
  UserCircle,
  Briefcase,
  ClipboardList,
  StickyNote,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Wallet,
  HandCoins,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';

const ALL_NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',   roles: ['ADMIN', 'MANAGER'] },
  { to: '/',          icon: LayoutDashboard, label: 'Home',        roles: ['WORKER'] },
  { to: '/tasks',     icon: ClipboardList,   label: 'My Tasks',    roles: ['WORKER'] },
  { to: '/members',   icon: Users,           label: 'Members',     roles: ['ADMIN', 'MANAGER'] },
  { to: '/chits',     icon: BookOpen,        label: 'Chit Funds',  roles: ['ADMIN', 'MANAGER'] },
  { to: '/payments',  icon: CreditCard,      label: 'Payments',    roles: ['ADMIN', 'MANAGER'] },
  { to: '/payouts',   icon: Banknote,        label: 'Payouts',     roles: ['ADMIN', 'MANAGER'] },
  // { to: '/draws',     icon: Shuffle,         label: 'Draws',       roles: ['ADMIN', 'MANAGER'] },
  { to: '/reports',   icon: BarChart2,       label: 'Reports',     roles: ['ADMIN', 'MANAGER'] },
  { to: '/treasury',   icon: Wallet,          label: 'Treasury',    roles: ['ADMIN'] },
  { to: '/settlement', icon: HandCoins,       label: 'Settlement',  roles: ['ADMIN'] },
  { to: '/team',       icon: Briefcase,       label: 'Team',        roles: ['ADMIN', 'MANAGER'] },
];

// ─── Quick Notes (ADMIN + MANAGER — real DB via team-notes API) ───────────────
function QuickNotes({ role }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [idx,  setIdx]  = useState(0);
  const wrapRef   = useRef(null);
  const popupRef  = useRef(null);
  const saveTimer = useRef(null);

  const [popupSize, setPopupSize] = useState({ width: 268, height: null });

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popupRef.current?.offsetWidth  ?? 268;
    const startH = popupRef.current?.offsetHeight ?? 280;
    function onMove(ev) {
      const newW = Math.max(220, startW + (ev.clientX - startX));
      const newH = Math.max(180, startH - (ev.clientY - startY));
      setPopupSize({ width: newW, height: newH });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }

  // Always-on fetch — powers the dot badge and instant open
  const { data: notes = [] } = useQuery({
    queryKey: ['team-notes'],
    queryFn: getTeamNotes,
  });

  const createMut = useMutation({
    mutationFn: createTeamNote,
    onSuccess: (created) => {
      qc.setQueryData(['team-notes'], (old = []) => [created, ...old]);
      setIdx(0);
    },
    onError: () => qc.invalidateQueries({ queryKey: ['team-notes'] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }) => updateTeamNote(id, payload),
    onSettled: () => qc.invalidateQueries({ queryKey: ['team-notes'] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteTeamNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-notes'] });
      setIdx(i => Math.max(0, i - 1));
    },
  });

  // Auto-popup once per session when notes exist
  useEffect(() => {
    if (notes.length > 0 && notes.some(n => n.text?.trim()) && !sessionStorage.getItem('notes_shown')) {
      setOpen(true);
      sessionStorage.setItem('notes_shown', '1');
    }
  }, [notes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const total       = notes.length;
  const safeIdx     = Math.min(idx, Math.max(0, total - 1));
  const currentNote = notes[safeIdx];
  const isOwn       = currentNote?.own ?? true;

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleTextChange(text) {
    if (!isOwn) return;
    // Optimistic local update for instant typing response
    qc.setQueryData(['team-notes'], (old = []) =>
      old.map((n, i) => (i === safeIdx ? { ...n, text } : n))
    );
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (currentNote?.id) {
        updateMut.mutate({ id: currentNote.id, payload: { text, visibility: currentNote.visibility } });
      }
    }, 800);
  }

  function toggleVisibility() {
    if (!currentNote?.id || !isOwn) return;
    const next = currentNote.visibility === 'SHARED' ? 'PRIVATE' : 'SHARED';
    qc.setQueryData(['team-notes'], (old = []) =>
      old.map((n, i) => (i === safeIdx ? { ...n, visibility: next } : n))
    );
    updateMut.mutate({ id: currentNote.id, payload: { text: currentNote.text ?? '', visibility: next } });
  }

  function addNote() {
    createMut.mutate({ text: '', visibility: 'PRIVATE' });
  }

  function deleteNote() {
    if (!isOwn) return;
    if (!currentNote?.id) return;
    if (total <= 1) {
      handleTextChange('');
      return;
    }
    deleteMut.mutate(currentNote.id);
  }

  const hasDot = notes.some(n => n.text?.trim());
  const isSaving = updateMut.isPending;

  return (
    <div ref={wrapRef} className="relative flex-1 flex flex-col">

      {/* ── Bubble popup ──────────────────────────────────────────────── */}
      {open && (
        <div className="absolute bottom-full left-2 mb-3 z-50">
          <div
            ref={popupRef}
            className="rounded-xl shadow-xl border border-amber-200 overflow-hidden flex flex-col relative"
            style={{
              background: 'linear-gradient(160deg, #fffbeb 0%, #fef3c7 100%)',
              width: popupSize.width,
              ...(popupSize.height ? { height: popupSize.height } : {}),
            }}
          >

            {/* Header */}
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-amber-200/60">
              <div className="flex items-center gap-1.5 min-w-0">
                <StickyNote size={12} className="text-amber-600 flex-shrink-0" />
                <span className="text-xs font-bold text-amber-900">Notes</span>
                {!isOwn && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold flex-shrink-0">
                    From {currentNote?.authorName ?? currentNote?.authorRole ?? 'Team'}
                  </span>
                )}
                {isOwn && currentNote?.visibility === 'SHARED' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-semibold flex-shrink-0">
                    Shared
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-amber-500 hover:text-amber-800 transition-colors p-0.5 rounded cursor-pointer flex-shrink-0 ml-1"
                title="Close"
              >
                <X size={12} />
              </button>
            </div>

            {/* Date posted */}
            {(() => {
              const ts = currentNote?.createdAt;
              if (!ts) return null;
              const label = new Date(ts).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true,
              });
              return (
                <div className="px-3 pt-1.5 pb-0 flex items-center gap-1">
                  <span className="text-[9px] text-amber-400">
                    {!isOwn ? `${currentNote?.authorName ?? 'Team'} · ` : ''}{label}
                  </span>
                </div>
              );
            })()}

            {/* Empty state */}
            {total === 0 && (
              <div className="flex flex-col items-center justify-center py-6 gap-2 opacity-60">
                <StickyNote size={22} className="text-amber-400" />
                <span className="text-xs text-amber-600">No notes yet — tap + to add one</span>
              </div>
            )}

            {/* Textarea — flex-1 when popup has an explicit height so it fills the space */}
            {total > 0 && (
            <textarea
              value={currentNote?.text ?? ''}
              onChange={(e) => handleTextChange(e.target.value)}
              readOnly={!isOwn}
              placeholder={
                !isOwn
                  ? `${currentNote?.authorName ?? 'Team'}'s note (read-only)`
                  : 'Jot something down…'
              }
              rows={popupSize.height ? undefined : 5}
              className={`w-full px-3 py-2 text-sm resize-none focus:outline-none ${
                popupSize.height ? 'flex-1 min-h-0' : ''
              } ${!isOwn ? 'text-gray-500 cursor-default select-text placeholder-amber-300' : 'text-gray-900 placeholder-amber-300'}`}
              style={{
                background: !isOwn ? 'rgba(0,0,0,0.025)' : 'transparent',
                fontFamily: "'Caveat', 'Patrick Hand', cursive, sans-serif",
                fontSize: '14px',
                lineHeight: '1.6',
              }}
              autoFocus={isOwn}
            />
            )}

            {/* Navigation bar */}
            <div className="px-2 py-1 border-t border-amber-200/60 flex items-center gap-0.5">
              {/* Left arrow */}
              <button
                onClick={() => setIdx(Math.max(0, safeIdx - 1))}
                disabled={safeIdx === 0}
                title="Previous note"
                className="p-0.5 rounded text-amber-500 hover:text-amber-800 hover:bg-amber-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft size={13} />
              </button>

              {/* Page indicator */}
              <span className="text-[10px] font-semibold text-amber-600 min-w-[32px] text-center">
                {total > 1 ? `${safeIdx + 1}/${total}` : '1'}
              </span>

              {/* Right arrow */}
              <button
                onClick={() => setIdx(Math.min(total - 1, safeIdx + 1))}
                disabled={safeIdx >= total - 1}
                title="Next note"
                className="p-0.5 rounded text-amber-500 hover:text-amber-800 hover:bg-amber-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight size={13} />
              </button>

              <div className="flex-1" />

              {/* Save indicator */}
              {isOwn && (currentNote?.text ?? '').length > 0 && (
                <span className="text-[9px] text-amber-400 mr-1">{isSaving ? 'saving…' : 'saved'}</span>
              )}

              {/* Add new note */}
              <button
                onClick={addNote}
                disabled={createMut.isPending}
                title="New note"
                className="p-0.5 rounded text-amber-500 hover:text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-40"
              >
                <Plus size={13} />
              </button>

              {/* Delete — only when there's a real note */}
              {isOwn && currentNote?.id && (
                <button
                  onClick={deleteNote}
                  title={total <= 1 ? 'Clear note' : 'Delete this note'}
                  className="flex items-center gap-0.5 px-1 py-0.5 rounded text-amber-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={11} />
                  <span className="text-[9px] font-medium">Delete</span>
                </button>
              )}
            </div>

            {/* Visibility toggle + resize handle (always last row) */}
            <div className="px-3 pb-2 pt-1.5 border-t border-amber-200/40 flex items-center gap-2">
              {isOwn && currentNote?.id && (
                <button
                  onClick={toggleVisibility}
                  title={currentNote?.visibility === 'SHARED' ? 'Make private' : 'Share with all admins & managers'}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="text-[10px] text-amber-600">
                    {currentNote?.visibility === 'SHARED' ? 'Shared with team' : 'Share with team'}
                  </span>
                  {/* Pill toggle */}
                  <div
                    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                      currentNote?.visibility === 'SHARED' ? 'bg-amber-400' : 'bg-amber-200'
                    }`}
                  >
                    <span
                      className={`absolute left-0 top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                        currentNote?.visibility === 'SHARED' ? 'translate-x-[18px]' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>
              )}
              <div className="flex-1" />
              {/* Resize handle — inlined so it never overlaps other controls */}
              <div
                onMouseDown={startResize}
                title="Drag to resize"
                className="cursor-se-resize opacity-40 hover:opacity-80 transition-opacity select-none flex-shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <line x1="2" y1="10" x2="10" y2="2" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="6"  y1="10" x2="10" y2="6"  stroke="#b45309" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="10" y1="10" x2="10" y2="10" stroke="#b45309" strokeWidth="2"   strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Bubble tail — points down toward the trigger icon */}
          <div
            className="absolute -bottom-[7px] left-6 w-3.5 h-3.5 border-r border-b border-amber-200 rotate-45"
            style={{ background: '#fef3c7' }}
          />
        </div>
      )}

      {/* ── Trigger button ───────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Quick notes"
        className={`relative w-full h-[60px] flex flex-col items-center justify-center gap-1 rounded-xl border transition-colors cursor-pointer ${
          open
            ? 'bg-amber-50 border-amber-300 text-amber-700'
            : 'bg-white border-gray-200 text-gray-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600'
        }`}
      >
        <StickyNote size={16} />
        <span className="text-[10px] font-medium">Notes</span>
        {hasDot && !open && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 border-2 border-white" />
        )}
      </button>
    </div>
  );
}

// ─── Switch-role modal (for WORKER/MANAGER switching to their MEMBER account) ──

function SidebarSwitchModal({ phone, altRole, altLabel, onClose }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const switchMutation = useMutation({
    mutationFn: () => loginByMobile({ phone, password, role: altRole }),
    onSuccess: (data) => {
      const token = data?.accessToken ?? data?.token;
      const role = data?.user?.role ?? altRole;
      login(token, {
        name: data?.user?.fullName ?? data?.user?.username,
        role,
        id: data?.user?.id,
        mustChangePassword: data?.user?.mustChangePassword ?? false,
      });
      onClose();
      navigate(role === 'MEMBER' ? '/member' : '/tasks');
    },
    onError: (e) => {
      setError(e.response?.data?.message ?? 'Invalid password. Please try again.');
    },
  });

  return (
    <Modal title={`Switch to ${altLabel} Account`} onClose={onClose} size="sm">
      <div className="space-y-5">
        <p className="text-sm text-gray-500 leading-relaxed">
          Enter your password to switch to your <span className="font-semibold text-gray-700">{altLabel}</span> account.
        </p>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <div className="relative">
            <Input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter your password"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && password.trim()) switchMutation.mutate(); }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <Button variant="muted" size="md" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            loading={switchMutation.isPending}
            disabled={!password.trim()}
            onClick={() => switchMutation.mutate()}
          >
            Switch
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Sign-out confirmation modal ──────────────────────────────────────────────
function SignOutModal({ onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-pointer bg-[#EFF4FA] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white"
        >✕</button>
        <div className="flex flex-col items-center text-center pt-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#FEE2E2' }}>
            <LogOut size={22} style={{ color: '#DC2626' }} />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1" style={{ fontFamily: 'Merriweather, serif' }}>Sign out?</h3>
          <p className="text-sm text-gray-500 mb-6">You'll need to sign in again to access your account.</p>
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
            >Cancel</button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 text-sm font-medium text-white rounded-xl transition-colors cursor-pointer"
              style={{ backgroundColor: '#DC2626' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#B91C1C')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#DC2626')}
            >Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar({ open = false, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { hidden, toggle: toggleHidden } = useHiddenAmounts();
  const role = user?.role ?? 'ADMIN';
  const initials = (user?.name ?? user?.username ?? 'U').slice(0, 2).toUpperCase();
  const [showSwitch, setShowSwitch] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);

  // Detect dual account for WORKER / MANAGER only
  const isStaff = role === 'WORKER' || role === 'MANAGER' || role === 'AGENT';
  const { data: me } = useQuery({
    queryKey: ['myUserAccount'],
    queryFn: getMe,
    enabled: isStaff,
  });
  const { data: lookup } = useQuery({
    queryKey: ['mobileLookup', me?.phone, me?.phoneCountryCode],
    queryFn: () => mobileLookup(me.phone, me.phoneCountryCode),
    enabled: !!me?.phone,
  });
  const memberAccount = lookup?.accounts?.find((a) => a.role === 'MEMBER');
  const altPhone = me?.phone;

  const nav = ALL_NAV.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <aside
      className={[
        // ── Shared layout ──────────────────────────────────────────────
        'flex flex-col bg-white',

        // ── Mobile / tablet: fixed drawer with slide transition ────────
        'fixed inset-y-0 left-0 z-50 w-72',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0 shadow-2xl' : '-translate-x-full',

        // ── Desktop (lg+): static, always visible, no shadow ──────────
        // These override the fixed/translate rules above at ≥1024px.
        'lg:relative lg:translate-x-0 lg:w-64 lg:z-auto',
        'lg:flex-shrink-0 lg:shadow-none lg:border-r lg:border-gray-200',
      ].join(' ')}
    >
      {/* ── Logo row + close button (mobile) + notification bell (desktop) ─ */}
      <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1E3A5F' }}
          >
            <BookOpen size={16} className="text-white" />
          </div>
          <div>
            <h1
              className="text-base font-bold leading-tight"
              style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
            >
              ChitWise
            </h1>
            <p className="text-xs text-gray-400">Management Platform</p>
          </div>
        </div>

        {/* Desktop: notification bell stays here */}
        <div className="hidden lg:block">
          <NotificationBell />
        </div>

        {/* Mobile/tablet: close (X) button */}
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Role badge */}
      <div className="px-6 py-2 border-b border-gray-100 flex-shrink-0">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: role === 'ADMIN' ? '#EFF3F8' : role === 'MANAGER' ? '#FEF3C7' : '#ECFDF5',
            color: role === 'ADMIN' ? '#1E3A5F' : role === 'MANAGER' ? '#D97706' : '#16A34A',
          }}
        >
          {role}
        </span>
      </div>

      {/* Navigation — scrollable if many items */}
      <nav
        className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto min-h-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to + label}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
            style={({ isActive }) =>
              isActive ? { backgroundColor: '#1E3A5F' } : {}
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-gray-100 flex-shrink-0">
        <button
          type="button"
          onClick={() => { navigate('/my-account'); onClose?.(); }}
          className="flex items-center gap-3 px-3 mb-2 w-full hover:bg-gray-50 rounded-lg py-2 transition-colors cursor-pointer text-left"
          title="My Account"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: '#D4A017' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.name ?? user?.username ?? 'User'}
            </p>
            <p className="text-xs text-[#1E3A5F] truncate font-medium flex items-center gap-1">
              <UserCircle size={10} /> My Account
            </p>
          </div>
        </button>
        {/* Switch to Member — only when a linked member account exists */}
        {memberAccount && altPhone && (
          <button
            onClick={() => setShowSwitch(true)}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-[#EFF4FA] hover:text-[#1E3A5F] transition-colors cursor-pointer mb-1"
          >
            <RefreshCw size={18} />
            Switch to Member
          </button>
        )}

        <div className="flex gap-2 mt-1">
          <button
            onClick={toggleHidden}
            title={hidden ? 'Show amounts' : 'Hide amounts'}
            className="flex-1 h-[60px] flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800 transition-colors cursor-pointer"
          >
            {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
            <span className="text-[10px] font-medium">{hidden ? 'Show' : 'Hide'}</span>
          </button>
          {(role === 'ADMIN' || role === 'MANAGER') && (
            <QuickNotes role={role} />
          )}
          <button
            onClick={() => setShowSignOut(true)}
            title="Sign out"
            className="flex-1 h-[60px] flex flex-col items-center justify-center gap-1 bg-white rounded-xl border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            <span className="text-[10px] font-medium">Sign out</span>
          </button>
        </div>
      </div>

      {showSwitch && memberAccount && altPhone && (
        <SidebarSwitchModal
          phone={altPhone}
          altRole="MEMBER"
          altLabel="Member"
          onClose={() => setShowSwitch(false)}
        />
      )}
      {showSignOut && createPortal(
        <SignOutModal
          onConfirm={logout}
          onClose={() => setShowSignOut(false)}
        />,
        document.body
      )}
    </aside>
  );
}
