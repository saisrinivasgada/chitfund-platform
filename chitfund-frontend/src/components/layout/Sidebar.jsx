import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../notifications/NotificationBell';
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
} from 'lucide-react';

const ALL_NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',   roles: ['ADMIN', 'MANAGER'] },
  { to: '/',          icon: LayoutDashboard, label: 'Home',        roles: ['WORKER'] },
  { to: '/tasks',     icon: ClipboardList,   label: 'My Tasks',    roles: ['WORKER'] },
  { to: '/members',   icon: Users,           label: 'Members',     roles: ['ADMIN', 'MANAGER'] },
  { to: '/chits',     icon: BookOpen,        label: 'Chit Funds',  roles: ['ADMIN', 'MANAGER'] },
  { to: '/payments',  icon: CreditCard,      label: 'Payments',    roles: ['ADMIN', 'MANAGER', 'WORKER'] },
  { to: '/payouts',   icon: Banknote,        label: 'Payouts',     roles: ['ADMIN', 'MANAGER'] },
  // { to: '/draws',     icon: Shuffle,         label: 'Draws',       roles: ['ADMIN', 'MANAGER'] },
  { to: '/reports',   icon: BarChart2,       label: 'Reports',     roles: ['ADMIN', 'MANAGER'] },
  { to: '/treasury',  icon: Wallet,          label: 'Treasury',    roles: ['ADMIN'] },
  { to: '/team',      icon: Briefcase,       label: 'Team',        roles: ['ADMIN', 'MANAGER'] },
];

// ─── Quick Notes (ADMIN + MANAGER, cross-role sharing via localStorage) ───────
function QuickNotes({ role }) {
  const OWN_KEY   = `chitfund_notes_${role}`;
  const OTHER_ROLE = role === 'ADMIN' ? 'MANAGER' : 'ADMIN';
  const OTHER_KEY  = `chitfund_notes_${OTHER_ROLE}`;
  const otherLabel = OTHER_ROLE === 'ADMIN' ? 'Admin' : 'Manager';

  const [open, setOpen] = useState(false);
  const [idx,  setIdx]  = useState(0);
  const wrapRef  = useRef(null);
  const popupRef = useRef(null);

  // Persist size across open/close so user's resize is remembered
  const [popupSize, setPopupSize] = useState({ width: 268, height: null });

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popupRef.current?.offsetWidth  ?? 268;
    const startH = popupRef.current?.offsetHeight ?? 280;

    function onMove(ev) {
      // dx: positive = wider; dy: negative (drag up) = taller (popup grows upward)
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

  const [ownNotes, setOwnNotes] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(OWN_KEY)) ?? [];
      return stored.length > 0
        ? stored
        : [{ id: String(Date.now()), text: '', shared: false }];
    } catch {
      return [{ id: String(Date.now()), text: '', shared: false }];
    }
  });

  // Shared notes from the other role — re-read every time popup opens
  const [sharedFromOther, setSharedFromOther] = useState([]);

  useEffect(() => {
    if (!open) return;
    try {
      const all = JSON.parse(localStorage.getItem(OTHER_KEY)) ?? [];
      setSharedFromOther(all.filter(n => n.shared && n.text.trim()));
    } catch {
      setSharedFromOther([]);
    }
    setIdx(0);
  }, [open, OTHER_KEY]);

  // Auto-save own notes to localStorage
  useEffect(() => {
    localStorage.setItem(OWN_KEY, JSON.stringify(ownNotes));
  }, [ownNotes, OWN_KEY]);

  // Auto-popup once per login session when there is saved content
  useEffect(() => {
    const hasContent = ownNotes.some(n => n.text.trim());
    if (hasContent && !sessionStorage.getItem('notes_shown')) {
      setOpen(true);
      sessionStorage.setItem('notes_shown', '1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // ── Derived state ────────────────────────────────────────────────────────────
  // Shared notes first, then own notes
  const allNotes = [...sharedFromOther, ...ownNotes];
  const safeIdx  = Math.min(idx, Math.max(0, allNotes.length - 1));
  const currentNote    = allNotes[safeIdx];
  const isViewingShared = safeIdx < sharedFromOther.length;
  const ownIdx          = safeIdx - sharedFromOther.length;

  // ── Mutations ────────────────────────────────────────────────────────────────
  function updateText(text) {
    if (isViewingShared) return;
    setOwnNotes(prev => prev.map((n, i) => i === ownIdx ? { ...n, text } : n));
  }

  function toggleShare() {
    if (isViewingShared) return;
    setOwnNotes(prev => prev.map((n, i) => i === ownIdx ? { ...n, shared: !n.shared } : n));
  }

  function addNote() {
    const newNote = { id: String(Date.now()), text: '', shared: false };
    setOwnNotes(prev => [...prev, newNote]);
    // Jump to the new note (it'll be at the end of allNotes after state updates)
    setIdx(sharedFromOther.length + ownNotes.length);
  }

  function deleteNote() {
    if (isViewingShared) return;
    if (ownNotes.length <= 1) {
      // Only one note — just clear its text instead of removing it
      setOwnNotes([{ id: String(Date.now()), text: '', shared: false }]);
      setIdx(sharedFromOther.length);
      return;
    }
    setOwnNotes(prev => prev.filter((_, i) => i !== ownIdx));
    setIdx(Math.max(0, safeIdx - 1));
  }

  // Dot: has own content OR other role has shared notes
  const hasDot = ownNotes.some(n => n.text.trim()) || (() => {
    try {
      const all = JSON.parse(localStorage.getItem(OTHER_KEY)) ?? [];
      return all.some(n => n.shared && n.text.trim());
    } catch { return false; }
  })();

  const total = allNotes.length;

  return (
    <div ref={wrapRef} className="relative">

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
                {isViewingShared && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold flex-shrink-0">
                    From {otherLabel}
                  </span>
                )}
                {!isViewingShared && currentNote?.shared && (
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

            {/* Textarea — flex-1 when popup has an explicit height so it fills the space */}
            <textarea
              value={currentNote?.text ?? ''}
              onChange={(e) => updateText(e.target.value)}
              readOnly={isViewingShared}
              placeholder={
                isViewingShared
                  ? `${otherLabel}'s note (read-only)`
                  : 'Jot something down…'
              }
              rows={popupSize.height ? undefined : 5}
              className={`w-full px-3 py-2 text-sm resize-none focus:outline-none ${
                popupSize.height ? 'flex-1 min-h-0' : ''
              } ${isViewingShared ? 'text-gray-500 cursor-default select-text placeholder-amber-300' : 'text-gray-900 placeholder-amber-300'}`}
              style={{
                background: isViewingShared ? 'rgba(0,0,0,0.025)' : 'transparent',
                fontFamily: "'Caveat', 'Patrick Hand', cursive, sans-serif",
                fontSize: '14px',
                lineHeight: '1.6',
              }}
              autoFocus={!isViewingShared}
            />

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

              {/* Auto-saved hint */}
              {!isViewingShared && (currentNote?.text ?? '').length > 0 && (
                <span className="text-[9px] text-amber-400 mr-1">saved</span>
              )}

              {/* Add new note */}
              <button
                onClick={addNote}
                title="New note"
                className="p-0.5 rounded text-amber-500 hover:text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <Plus size={13} />
              </button>

              {/* Delete — always visible for own notes */}
              {!isViewingShared && (
                <button
                  onClick={deleteNote}
                  title={ownNotes.length <= 1 ? 'Clear note' : 'Delete this note'}
                  className="p-0.5 rounded text-amber-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Share toggle — own notes only */}
            {!isViewingShared && (
              <div className="px-3 pb-2.5 pt-1.5 border-t border-amber-200/40 flex items-center justify-between">
                <span className="text-[10px] text-amber-600">
                  {currentNote?.shared ? `Shared with ${otherLabel}` : `Share with ${otherLabel}`}
                </span>
                {/* Pill toggle */}
                <button
                  onClick={toggleShare}
                  title={currentNote?.shared ? 'Stop sharing' : `Share with ${otherLabel}`}
                  className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                    currentNote?.shared ? 'bg-amber-400' : 'bg-amber-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                      currentNote?.shared ? 'translate-x-[17px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Resize handle — bottom-right corner, drag right/up to grow */}
            <div
              onMouseDown={startResize}
              title="Drag to resize"
              className="absolute bottom-1 right-1 z-20 cursor-se-resize opacity-40 hover:opacity-80 transition-opacity select-none"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <line x1="2" y1="10" x2="10" y2="2" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="6"  y1="10" x2="10" y2="6"  stroke="#b45309" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="10" y1="10" x2="10" y2="10" stroke="#b45309" strokeWidth="2"   strokeLinecap="round"/>
              </svg>
            </div>
          </div>

          {/* Bubble tail — points down toward the trigger icon */}
          <div
            className="absolute -bottom-[7px] left-6 w-3.5 h-3.5 border-r border-b border-amber-200 rotate-45"
            style={{ background: '#fef3c7' }}
          />
        </div>
      )}

      {/* ── Trigger icon ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Quick notes"
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${
          open
            ? 'bg-amber-100 text-amber-600 shadow-inner'
            : 'text-gray-400 hover:bg-amber-50 hover:text-amber-500'
        }`}
      >
        <StickyNote size={17} />
        {/* Dot when there is content (own or shared-from-other) and bubble is closed */}
        {hasDot && !open && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400 border-2 border-white" />
        )}
      </button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar({ open = false, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role ?? 'ADMIN';
  const initials = (user?.name ?? user?.username ?? 'U').slice(0, 2).toUpperCase();

  const nav = ALL_NAV.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <aside
      className={[
        // ── Shared layout ──────────────────────────────────────────────
        'flex flex-col bg-white overflow-hidden',

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
              ChitFund
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

      {/* Quick Notes — ADMIN and MANAGER only */}
      {(role === 'ADMIN' || role === 'MANAGER') && (
        <div className="px-3 pb-1 flex-shrink-0">
          <QuickNotes role={role} />
        </div>
      )}

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
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
