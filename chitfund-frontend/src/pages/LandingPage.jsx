import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPublicPlans } from '../services/api';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  BookOpen, ArrowRight, ChevronDown, Shield, Zap, Users, BarChart2,
  Check, Star, ArrowUpRight, RefreshCw, Headphones,
  LogIn, Building2, UserCheck, ClipboardList, Trophy, IndianRupee, Calendar,
  Bell, FileText, PieChart, LayoutDashboard, CreditCard, Banknote,
  Clock, PackageCheck, AlertTriangle, Wallet, Shuffle, Briefcase,
  TrendingUp, Layers, HandCoins, ChevronRight, ChevronLeft, ArrowLeft,
  Phone, PenLine, X, BookMarked, MessageCircle, Smartphone, Lock, Play,
} from 'lucide-react';
const P = '#1E3A5F';

function Reveal({ children, delay = 0, dir = 'up', className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const dirs = { up: { y: 52, x: 0 }, left: { y: 0, x: -52 }, right: { y: 0, x: 52 }, none: { y: 0, x: 0 } };
  return (
    <motion.div
      ref={ref}
      className={className}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, ...dirs[dir] }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/* ── Browser frame wrapper ── */
function AppFrame({ children, url = 'app.chitwise.in', dark = false }) {
  return (
    <div className={`rounded-2xl overflow-hidden shadow-2xl ${dark ? 'border border-white/15' : 'border border-gray-200'}`}>
      <div className={`px-4 py-2.5 flex items-center gap-3 ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-400/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
          <div className="w-3 h-3 rounded-full bg-green-400/80" />
        </div>
        <div className={`flex-1 mx-2 rounded-md text-xs px-3 py-1 text-center ${dark ? 'bg-white/10 text-white/40' : 'bg-white text-gray-400'}`}>
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Sidebar nav item ── */
function SideNavItem({ icon: Icon, label, active }) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium"
      style={{
        backgroundColor: active ? `${P}15` : 'transparent',
        color: active ? P : '#6B7280',
      }}
    >
      <Icon size={13} />
      {label}
    </div>
  );
}

/* ── App stat card — icon on top, text below, truncate on overflow ── */
function AppStatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2.5 flex flex-col items-center text-center min-w-0 overflow-hidden gap-1">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}18` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <p className="text-sm font-bold text-gray-900 leading-tight w-full truncate">{value}</p>
      <p className="text-xs text-gray-400 w-full truncate">{label}</p>
      {sub && <p className="text-xs text-gray-400 w-full truncate">{sub}</p>}
    </div>
  );
}

/* ── Chit row (matches DashboardPage recent chits) ── */
function ChitRow({ name, amount, members, status }) {
  const statusColors = {
    ACTIVE: { bg: '#DCFCE7', text: '#15803D' },
    COMPLETED: { bg: '#F3F4F6', text: '#6B7280' },
    PENDING: { bg: '#DBEAFE', text: '#1D4ED8' },
  };
  const s = statusColors[status] ?? statusColors.ACTIVE;
  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-xs font-medium text-gray-900">{name}</p>
        <p className="text-xs text-gray-400">₹{amount}/draw · {members} members</p>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: s.bg, color: s.text }}>{status}</span>
    </div>
  );
}

/* ── Member row ── */
function MemberRow({ name, phone, initial }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: P }}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate">{name}</p>
        <p className="text-xs text-gray-400">{phone}</p>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">ACTIVE</span>
    </div>
  );
}

const FEATURE_SLIDES = [
  {
    badge: 'Admin dashboard',
    badgeIcon: BarChart2,
    headline: ['Everything at a', 'glance.'],
    accentWord: 'glance.',
    desc: 'Collections, payouts, treasury balance, draw status, cash pickup workflow — your entire operation visible from one screen.',
    bullets: ['Live chit group overview', 'Cash & digital collections', 'Draw winner tracking', 'Treasury balance'],
    bulletIcons: [BookOpen, IndianRupee, Trophy, Wallet],
    mockup: 'dashboard',
  },
  {
    badge: 'Reports & analytics',
    badgeIcon: BarChart2,
    headline: ['Your numbers,', 'always clear.'],
    accentWord: 'always clear.',
    desc: 'Monthly collection trends, payment completion rates, chit group performance — see exactly how your business is doing at any point.',
    bullets: ['Monthly collection trends', 'Group-wise performance view', 'Member payment completion rates', 'One-click export'],
    bulletIcons: [TrendingUp, BarChart2, Users, FileText],
    mockup: 'analytics',
  },
  {
    badge: 'Member self-service',
    badgeIcon: UserCheck,
    headline: ['Every member gets', 'their own portal.'],
    accentWord: 'their own portal.',
    desc: 'Members view their chit group status, installment history, upcoming draws, and payout schedule — without calling you.',
    bullets: ['Instant portal access after joining', 'Installment receipts always available', 'Draw results and prize notifications', 'See exactly when payout is scheduled'],
    bulletIcons: [Smartphone, FileText, Bell, Calendar],
    mockup: 'member',
  },
];

function DashboardMockup() {
  return (
    <AppFrame url="app.thechitwise.com/dashboard" dark>
      <div className="flex" style={{ backgroundColor: '#F0F2F5', height: 420 }}>
        <div className="w-36 bg-white border-r border-gray-100 flex flex-col py-3 px-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 mb-4">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: P }}>
              <BookOpen size={10} className="text-white" />
            </div>
            <span className="text-xs font-bold" style={{ color: P, fontFamily: 'Merriweather, serif' }}>ChitWise</span>
          </div>
          {SIDEBAR_NAV.map(({ icon, label, active }) => (
            <SideNavItem key={label} icon={icon} label={label} active={active} />
          ))}
        </div>
        <div className="flex-1 overflow-hidden p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold" style={{ color: P, fontFamily: 'Merriweather, serif' }}>Welcome back, Admin</p>
              <p className="text-xs text-gray-400">Here's what's happening today.</p>
            </div>
            <div className="flex gap-1.5">
              <div className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: P }}>+ New Chit</div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={11} style={{ color: P }} />
              <span className="text-xs font-semibold text-gray-700">At a Glance</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="grid grid-cols-5 gap-2">
              <AppStatCard icon={BookOpen}   label="Total Chits"    value="12" color="#1E3A5F" sub="10 active" />
              <AppStatCard icon={CreditCard} label="Active Chits"   value="10" color="#16A34A" />
              <AppStatCard icon={Users}      label="Members"        value="248" color="#D4A017" />
              <AppStatCard icon={Banknote}   label="Pending Payout" value="3"  color="#7C3AED" sub="winner selected" />
              <AppStatCard icon={Trophy}     label="Disbursement"   value="2"  color="#DC2626" sub="pending" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 flex-1 min-h-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/60">
                <span className="text-xs font-semibold text-gray-800">Recent Chit Funds</span>
                <span className="text-xs text-blue-600">View all →</span>
              </div>
              <ChitRow name="1 Lakh - Group 1 (Nov 2024)"  amount="5,000"  members={20} status="ACTIVE" />
              <ChitRow name="20K - Group 2 (Mar 2025)"     amount="2,000"  members={10} status="ACTIVE" />
              <ChitRow name="4 Lakhs - Group 3 (Apr 2024)" amount="10,000" members={40} status="COMPLETED" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/60">
                <span className="text-xs font-semibold text-gray-800">Recent Members</span>
                <span className="text-xs text-blue-600">View all →</span>
              </div>
              <MemberRow name="Venkatesh R."  phone="+91 98765 43210" initial="V" />
              <MemberRow name="Padmavathi K." phone="+91 87654 32109" initial="P" />
              <MemberRow name="Suresh Babu"   phone="+91 76543 21098" initial="S" />
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function DrawsMockup() {
  return (
    <AppFrame url="app.thechitwise.com/chits/42">
      <div style={{ backgroundColor: '#F0F2F5' }}>
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EFF4FA' }}>
            <ArrowLeft size={12} style={{ color: P }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: P }}>1 Lakh - Group 1 (Nov 2024)</p>
            <p className="text-xs text-gray-400">₹1,00,000 · 20 members · Draw 8 / 20</p>
          </div>
          <span className="ml-auto text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">ACTIVE</span>
        </div>
        <div className="flex gap-2 px-5 py-3 bg-white border-b border-gray-100 overflow-x-auto">
          {['Overview', 'Members', 'Draws', 'Payments', 'Payouts'].map((tab) => (
            <button key={tab} className="text-xs font-semibold rounded-full px-3 py-1.5 whitespace-nowrap"
              style={tab === 'Draws' ? { backgroundColor: P, color: 'white', border: `1.5px solid ${P}` } : { backgroundColor: 'white', color: '#374151', border: '1.5px solid #D1D5DB' }}>
              {tab}
            </button>
          ))}
        </div>
        <div className="px-4 py-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div>
                <p className="text-xs font-bold text-gray-900">Draw 8 — July 2025</p>
                <p className="text-xs text-gray-400">₹15,000 collected of ₹20,000</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">In Progress</span>
            </div>
            <div className="divide-y divide-gray-50">
              {DRAW_ROWS.map(({ name, draw, amount, status, color, bg }) => (
                <div key={name} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: P }}>
                      {name.split(' ').map(w => w[0]).join('')}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900">{name}</p>
                      <p className="text-xs text-gray-400">Draw {draw} / 20</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-800">{amount}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: bg, color }}>{status}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-100">
              <p className="text-xs text-yellow-800 font-semibold">🏆 Prized: Venkatesh R. — Dividend ₹4,200 · Commission ₹4,000</p>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function MemberMockup() {
  return (
    <AppFrame url="member.thechitwise.com" dark>
      <div style={{ backgroundColor: '#F0F2F5' }}>
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: P }}>VR</div>
            <div>
              <p className="text-sm font-bold text-gray-900">Venkatesh Reddy</p>
              <p className="text-xs text-gray-400">Member #2041</p>
            </div>
          </div>
          <Bell size={14} className="text-gray-400" />
        </div>
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2">
          {MEMBER_TABS.map(({ label, icon: Icon, active }) => (
            <button key={label} className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5"
              style={active ? { backgroundColor: P, color: 'white', border: `1.5px solid ${P}` } : { backgroundColor: 'white', color: '#6B7280', border: '1.5px solid #D1D5DB' }}>
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#86EFAC' }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }}>
              <p className="text-xs font-bold text-gray-800">1 LAKH - GROUP 1 (NOV 2024)</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">Active</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-3 gap-4">
              {[{ label: 'Chit value', val: '₹1,00,000' }, { label: 'Draw', val: '8 / 20' }, { label: 'My installment', val: '₹4,600' }].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="text-sm font-bold text-gray-900">{val}</p>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 border-t border-gray-50 flex items-center justify-between">
              <p className="text-xs text-gray-400">Not yet prized</p>
              <p className="text-xs font-semibold" style={{ color: P }}>Next draw: Aug 1 →</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1E3A5F18' }}>
                <IndianRupee size={13} style={{ color: P }} />
              </div>
              <div><p className="text-xs text-gray-400">Total paid</p><p className="text-sm font-bold text-gray-900">₹36,800</p></div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#D4A01718' }}>
                <Trophy size={13} style={{ color: '#D4A017' }} />
              </div>
              <div><p className="text-xs text-gray-400">Draws left</p><p className="text-sm font-bold text-gray-900">12 draws</p></div>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-800 font-semibold">🔔 Draw 8: Padmavathi K. is prized — ₹96,000 payout after commission</p>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function AnalyticsMockup() {
  const bars = [
    { month: 'Mar', pct: 72 }, { month: 'Apr', pct: 85 }, { month: 'May', pct: 91 },
    { month: 'Jun', pct: 68 }, { month: 'Jul', pct: 100 }, { month: 'Aug', pct: 78 },
  ];
  return (
    <AppFrame url="app.thechitwise.com/reports" dark>
      <div style={{ backgroundColor: '#F0F2F5' }}>
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-100">
          <div>
            <p className="text-sm font-bold" style={{ color: P, fontFamily: 'Merriweather, serif' }}>Reports</p>
            <p className="text-xs text-gray-400">All chit groups · Aug 2025</p>
          </div>
          <div className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 bg-white">Export</div>
        </div>
        <div className="flex gap-2 px-4 py-2 bg-white border-b border-gray-100">
          {['Overview', 'Collections', 'Members'].map(t => (
            <button key={t} className="text-xs font-semibold rounded-full px-3 py-1.5"
              style={t === 'Overview' ? { backgroundColor: P, color: 'white' } : { backgroundColor: 'white', color: '#6B7280', border: '1px solid #D1D5DB' }}>
              {t}
            </button>
          ))}
        </div>
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Collected', val: '₹8.4L', sub: 'this month', color: '#16A34A', bg: '#F0FDF4' },
              { label: 'Paid Out',  val: '₹6.2L', sub: 'this month', color: P,         bg: '#EFF4FA' },
              { label: 'Pending',   val: '₹2.2L', sub: '12 members', color: '#D97706', bg: '#FFFBEB' },
            ].map(({ label, val, sub, color, bg }) => (
              <div key={label} className="rounded-xl p-2.5" style={{ backgroundColor: bg }}>
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className="text-sm font-bold" style={{ color }}>{val}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-800">Monthly collections</p>
              <span className="text-xs text-gray-400">Mar – Aug</span>
            </div>
            <div className="flex items-end gap-1.5" style={{ height: 72 }}>
              {bars.map(({ month, pct }) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t" style={{ height: `${pct}%`, backgroundColor: pct === 100 ? P : '#93C5FD' }} />
                  <span className="text-xs text-gray-400">{month}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-800">Top chit groups</p>
            </div>
            {[
              { name: '1 Lakh – Group 1', collected: '₹2.1L', rate: '95%', color: '#16A34A' },
              { name: '50K – Group 2',    collected: '₹1.4L', rate: '88%', color: '#2563EB' },
              { name: '25K – Group 3',    collected: '₹0.9L', rate: '72%', color: '#D97706' },
            ].map(({ name, collected, rate, color }) => (
              <div key={name} className="flex items-center justify-between px-4 py-2 border-b border-gray-50 last:border-0">
                <p className="text-xs font-medium text-gray-700">{name}</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-800">{collected}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '18', color }}>{rate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

const SLIDER_INTERVAL_MS = 5000;
const PAUSE_MS = 45000;

// Shared hook: auto-advance, pause-on-click toggle, fill-freeze at exact click position, countdown
function useSlider(count) {
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);
  const [progressKey, setProgressKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [frozenFill, setFrozenFill] = useState(0);

  const containerRef = useRef(null);
  const inView = useInView(containerRef, { once: true, amount: 0.3 });
  const activeRef = useRef(0);
  activeRef.current = active;
  const pauseTimerRef = useRef(null);
  const pauseEndTimeRef = useRef(0);
  const slideNetStartRef = useRef(Date.now());
  const frozenFillRef = useRef(0);

  useEffect(() => {
    if (!inView) return;
    clearTimeout(pauseTimerRef.current);
    slideNetStartRef.current = Date.now();
    frozenFillRef.current = 0;
    setDir(1); setActive(0); setProgressKey(k => k + 1);
    setFrozenFill(0); setPaused(false);
  }, [inView]);

  const go = useCallback((next) => {
    const curr = activeRef.current;
    const n = typeof next === 'function' ? next(curr) : next;
    setDir(n > curr ? 1 : -1);
    setActive(n);
    setProgressKey(k => k + 1);
    setFrozenFill(0);
    frozenFillRef.current = 0;
    slideNetStartRef.current = Date.now();
  }, []);

  // Toggle: click while playing → pause + freeze fill; click while paused → resume from frozen position
  const handleClick = useCallback(() => {
    if (paused) {
      clearTimeout(pauseTimerRef.current);
      // Restore slide net-start so remaining time = (1 - frozenFill) * interval
      slideNetStartRef.current = Date.now() - frozenFillRef.current * SLIDER_INTERVAL_MS;
      setPaused(false);
      setTimeLeft(0);
      setProgressKey(k => k + 1);
    } else {
      const elapsed = Date.now() - slideNetStartRef.current;
      const fill = Math.min(1, elapsed / SLIDER_INTERVAL_MS);
      frozenFillRef.current = fill;
      setFrozenFill(fill);
      setPaused(true);
      setTimeLeft(PAUSE_MS / 1000);
      pauseEndTimeRef.current = Date.now() + PAUSE_MS;
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        // Auto-resume: continue from frozen position
        slideNetStartRef.current = Date.now() - frozenFillRef.current * SLIDER_INTERVAL_MS;
        setPaused(false);
        setProgressKey(k => k + 1);
      }, PAUSE_MS);
    }
  }, [paused]);

  useEffect(() => {
    if (!paused) { setTimeLeft(0); return; }
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((pauseEndTimeRef.current - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [paused]);

  // Auto-advance fires after the REMAINING time on current slide (handles resume-from-frozen correctly)
  useEffect(() => {
    if (paused) return;
    const elapsed = Date.now() - slideNetStartRef.current;
    const remaining = Math.max(100, SLIDER_INTERVAL_MS - elapsed);
    const id = setTimeout(() => go(a => (a + 1) % count), remaining);
    return () => clearTimeout(id);
  }, [paused, progressKey, go, count]);

  useEffect(() => () => clearTimeout(pauseTimerRef.current), []);

  return {
    active, dir, progressKey, paused, timeLeft, frozenFill, containerRef, go, handleClick,
    prev: () => go((active - 1 + count) % count),
    next: () => go((active + 1) % count),
  };
}

// Shared pill fill indicator rendered inside a tab button
function SliderFill({ isActive, paused, progressKey, frozenFill, fillColor = 'white' }) {
  if (!isActive) return null;
  if (!paused) return (
    <motion.div key={progressKey}
      style={{ position: 'absolute', inset: 0, backgroundColor: fillColor, transformOrigin: 'left', borderRadius: 'inherit' }}
      initial={{ scaleX: frozenFill }}
      animate={{ scaleX: 1 }}
      transition={{ duration: (1 - frozenFill) * SLIDER_INTERVAL_MS / 1000, ease: 'linear' }} />
  );
  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: fillColor, borderRadius: 'inherit', transform: `scaleX(${frozenFill})`, transformOrigin: 'left' }} />
  );
}

// Shared countdown badge
function SliderCountdown({ paused, timeLeft }) {
  return (
    <AnimatePresence>
      {paused && timeLeft > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
          className="absolute top-0 right-0 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium pointer-events-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.55)' }}>
          <Play size={9} />
          tap to resume · {timeLeft}s
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FeatureSlider() {
  const { active, dir, progressKey, paused, timeLeft, frozenFill, containerRef, go, handleClick, prev, next } = useSlider(FEATURE_SLIDES.length);
  const slide = FEATURE_SLIDES[active];
  const MockupMap = { dashboard: DashboardMockup, draws: DrawsMockup, member: MemberMockup, analytics: AnalyticsMockup };
  const Mockup = MockupMap[slide.mockup];

  return (
    <div ref={containerRef} className="relative cursor-pointer" onClick={handleClick}>
      <SliderCountdown paused={paused} timeLeft={timeLeft} />

      {/* Tab labels */}
      <div className="flex justify-center gap-2 mb-10 flex-wrap">
        {FEATURE_SLIDES.map((s, i) => {
          const Icon = s.badgeIcon;
          const isActive = i === active;
          return (
            <button key={i} onClick={() => go(i)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold overflow-hidden"
              style={isActive ? { backgroundColor: 'rgba(255,255,255,0.35)', color: P } : { backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', transition: 'all 0.2s' }}>
              <SliderFill isActive={isActive} paused={paused} progressKey={progressKey} frozenFill={frozenFill} />
              <span className="relative z-10 flex items-center gap-2"><Icon size={13} />{s.badge}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
        <div className="relative overflow-hidden" style={{ height: 420 }}>
          <AnimatePresence initial={false}>
            <motion.div key={active} style={{ position: 'absolute', width: '100%', top: 0, left: 0 }}
              initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -40 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}>
              <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-snug mb-6" style={{ fontFamily: 'Merriweather, serif' }}>
                {slide.headline[0]}<br /><span style={{ color: '#93C5FD' }}>{slide.headline[1]}</span>
              </h2>
              <p className="text-white/70 text-lg leading-relaxed mb-8">{slide.desc}</p>
              <div className="grid grid-cols-2 gap-3">
                {slide.bullets.map((b, i) => {
                  const Icon = slide.bulletIcons[i];
                  return (
                    <div key={b} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                      <Icon size={14} className="text-blue-300 flex-shrink-0" />
                      <span className="text-sm text-white/80">{b}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="hidden lg:block relative overflow-hidden" style={{ height: 420 }}>
          <AnimatePresence initial={false}>
            <motion.div key={active} style={{ position: 'absolute', width: '100%', top: 0, left: 0 }}
              initial={{ opacity: 0, x: dir * 60 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -60 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}>
              <Mockup />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 mt-12">
        <button onClick={prev} className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex items-center gap-2.5">
          {FEATURE_SLIDES.map((_, i) => (
            <button key={i} onClick={() => go(i)} className="transition-all duration-200 rounded-full"
              style={{ width: i === active ? 28 : 8, height: 8, backgroundColor: i === active ? 'white' : 'rgba(255,255,255,0.3)' }} />
          ))}
        </div>
        <button onClick={next} className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
          <ChevronRight size={20} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ── Problems slider (WHEN RECORDS BREAK DOWN section) ──────────────────────────
const PROBLEM_SLIDES = [
  {
    badge: 'Payment dispute',
    badgeIcon: MessageCircle,
    color: '#F87171',
    visual: 'chat',
    headline: 'No proof of payment.',
    accent: "And now it's personal.",
    desc: "Without a digital receipt, any payment dispute turns into a he-said-she-said. Members call each other liars. Trust breaks down fast — and word spreads through the neighbourhood.",
  },
  {
    badge: 'Lost records',
    badgeIcon: FileText,
    color: '#FBBF24',
    visual: 'icon',
    headline: '"The register got damaged."',
    accent: 'Years of records, gone.',
    desc: 'A notebook destroyed in rain, a page torn out, entries crossed and re-written — years of member records gone or disputed. No way to recover the truth.',
    quote: '"I can\'t find the payment record. The notebook got wet in the rains last month."',
  },
  {
    badge: 'Draw dispute',
    badgeIcon: Trophy,
    color: '#34D399',
    visual: 'icon',
    headline: '"Who actually won the draw?"',
    accent: 'No audit trail. No answer.',
    desc: 'Draw run verbally in a room. Winner announced. But another member contests it a week later. Without a record, there is no official answer — just conflicting memories.',
    quote: '"I heard a different name announced. When was it changed? Who decided?"',
  },
  {
    badge: 'Missing cash',
    badgeIcon: IndianRupee,
    color: '#A78BFA',
    visual: 'icon',
    headline: '"The cash that never reached."',
    accent: 'No receipts. No proof.',
    desc: "A staff member collected from 6 members. Says it was ₹30,000. The register shows ₹25,000. No receipts were given. Two members swear they paid. Who's right?",
    quote: '"I gave ₹5,000 to Ravi anna. Why is it not in the register?"',
  },
  {
    badge: 'Trust collapses',
    badgeIcon: AlertTriangle,
    color: '#F87171',
    visual: 'icon',
    headline: 'One dispute can collapse everything.',
    accent: "Trust is a chit fund's only currency.",
    desc: 'Word spreads fast in a neighbourhood. One unresolved payment dispute, one unclear draw result, and members start pulling out. A chit fund runs on trust — and trust is fragile.',
    quote: '"I am telling everyone in the group about this. This is not okay."',
  },
];

function ProblemVisual({ slide }) {
  const Icon = slide.badgeIcon;
  if (slide.visual === 'chat') {
    return (
      <div className="rounded-3xl overflow-hidden shadow-2xl border border-red-900/30">
        <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#075E54' }}>
          <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">RK</div>
          <div>
            <p className="text-sm font-bold text-white">Ramesh (Member)</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>1 Lakh - Group 1 (Jan 2026)</p>
          </div>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-semibold">Real situation</span>
        </div>
        <div className="p-4 space-y-3" style={{ backgroundColor: '#0B141A' }}>
          {[
            { from: 'member', text: 'Bhai, I paid ₹5,000 last month. Why is it showing unpaid in your list?', time: '10:14 AM' },
            { from: 'admin',  text: "Ramesh bhai I am checking the register... I don't see your payment here", time: '10:22 AM' },
            { from: 'member', text: 'I paid cash to Ravi anna! Ask him!', time: '10:23 AM' },
            { from: 'admin',  text: "Ravi says he didn't collect from you this draw...", time: '10:35 AM' },
            { from: 'member', text: 'Are you calling me a liar??? I have given ₹40,000 over 8 draws without any problem!!', time: '10:36 AM' },
            { from: 'admin',  text: '😰 Ramesh bhai please calm down, let me check with Ravi again...', time: '10:52 AM' },
            { from: 'member', text: 'I am telling everyone in the group about this. This is not okay.', time: '10:53 AM' },
          ].map((msg, i) => (
            <div key={i} className={`flex ${msg.from === 'admin' ? 'justify-start' : 'justify-end'}`}>
              <div className="max-w-[80%] rounded-2xl px-3 py-2 shadow-sm"
                style={{ backgroundColor: msg.from === 'admin' ? '#202C33' : '#005C4B' }}>
                <p className="text-xs text-white leading-relaxed">{msg.text}</p>
                <p className="text-right mt-1" style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{msg.time}</p>
              </div>
            </div>
          ))}
          <div className="rounded-xl px-3 py-2 border border-red-900/50" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
            <p className="text-xs text-red-400 font-semibold">⚠️ No receipt. No digital record. No way to prove either side.</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-3xl p-8 flex flex-col justify-between" style={{ backgroundColor: '#120808', border: `1px solid ${slide.color}25`, minHeight: 540 }}>
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ backgroundColor: slide.color + '18' }}>
        <Icon size={30} style={{ color: slide.color }} />
      </div>
      <div>
        <div className="w-8 h-0.5 mb-5" style={{ backgroundColor: slide.color + '50' }} />
        <p className="text-xl sm:text-2xl font-bold leading-snug" style={{ color: 'rgba(255,255,255,0.88)' }}>{slide.quote}</p>
        <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.28)' }}>— Member, during a dispute</p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-1 rounded-full" style={{ width: i === 0 ? 32 : 12, backgroundColor: i === 0 ? slide.color : slide.color + '30' }} />
        ))}
      </div>
    </div>
  );
}

function ProblemsSlider() {
  const { active, dir, progressKey, paused, timeLeft, frozenFill, containerRef, go, handleClick, prev, next } = useSlider(PROBLEM_SLIDES.length);
  const slide = PROBLEM_SLIDES[active];

  return (
    <div ref={containerRef} className="relative cursor-pointer" onClick={handleClick}>
      <SliderCountdown paused={paused} timeLeft={timeLeft} />

      {/* Tab labels */}
      <div className="flex justify-center gap-2 mb-10 flex-wrap">
        {PROBLEM_SLIDES.map((s, i) => {
          const Icon = s.badgeIcon;
          const isActive = i === active;
          return (
            <button key={i} onClick={() => go(i)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold overflow-hidden"
              style={isActive ? { backgroundColor: 'rgba(255,255,255,0.25)', color: '#1A0A0A' } : { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', transition: 'all 0.2s' }}>
              <SliderFill isActive={isActive} paused={paused} progressKey={progressKey} frozenFill={frozenFill} />
              <span className="relative z-10 flex items-center gap-2"><Icon size={13} />{s.badge}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
        {/* Visual side */}
        <div className="relative overflow-hidden" style={{ height: 600 }}>
          <AnimatePresence initial={false}>
            <motion.div key={active} style={{ position: 'absolute', width: '100%', top: 0, left: 0 }}
              initial={{ opacity: 0, x: dir * 50 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -50 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}>
              <ProblemVisual slide={slide} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Text side */}
        <div className="relative overflow-hidden" style={{ height: 600 }}>
          <AnimatePresence initial={false}>
            <motion.div key={active} style={{ position: 'absolute', width: '100%', top: 0, left: 0 }}
              initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -40 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: slide.color + '20' }}>
                  <slide.badgeIcon size={15} style={{ color: slide.color }} />
                </div>
                <span className="text-sm font-semibold" style={{ color: slide.color }}>{slide.badge}</span>
              </div>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-2" style={{ fontFamily: 'Merriweather, serif' }}>
                {slide.headline}
              </h3>
              <p className="text-lg font-semibold mb-6" style={{ color: slide.color }}>{slide.accent}</p>
              <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{slide.desc}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 mt-12">
        <button onClick={prev} className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex items-center gap-2.5">
          {PROBLEM_SLIDES.map((_, i) => (
            <button key={i} onClick={() => go(i)} className="transition-all duration-200 rounded-full"
              style={{ width: i === active ? 28 : 8, height: 8, backgroundColor: i === active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>
        <button onClick={next} className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)' }}>
          <ChevronRight size={20} className="text-white" />
        </button>
      </div>
    </div>
  );
}

function apiPlanToCard(p, allPlans) {
  const isCustom = p.plan === 'CUSTOM';
  const hasDiscount = p.globalDiscountPct != null && p.globalDiscountPct > 0;
  const effectiveRupees = (p.effectivePriceInr ?? p.priceMonthlyInr) / 100;
  const originalRupees = p.priceMonthlyInr / 100;

  const priceStr = isCustom ? 'Contact us'
    : p.priceMonthlyInr === 0 ? 'Free'
    : `₹${effectiveRupees.toLocaleString('en-IN')}/mo`;

  const sub = isCustom ? 'Tailored pricing for large operations'
    : hasDiscount ? `₹${originalRupees}/mo original`
    : 'Billed monthly, cancel anytime';

  const badge = hasDiscount ? `${p.globalDiscountPct}% off` : null;
  const selectablePlans = allPlans.filter(x => x.plan !== 'CUSTOM');
  const midIdx = Math.floor(selectablePlans.length / 2);
  const highlight = selectablePlans[midIdx]?.plan === p.plan;

  return { plan: p.plan, label: p.displayName, tagline: p.tagline, price: priceStr, sub, badge, features: p.features ?? [], highlight, isCustom };
}

const PORTALS = [
  {
    icon: Building2, title: 'Admin', color: P, bg: '#EFF4FA',
    desc: 'Full control — manage chit groups, members, draws, collections, payouts, and treasury.',
    features: ['Create & manage chit groups', 'Record collections per draw', 'Process payouts to prized members', 'Full audit trail & treasury reports'],
  },
  {
    icon: ClipboardList, title: 'Manager / Staff', color: '#0369A1', bg: '#EFF8FF',
    desc: 'Field operations — record cash collections, handle remittances, and manage cash pickup requests.',
    features: ['Record cash payments on the go', 'Raise cash pickup requests', 'View assigned chit groups', 'Daily collection summary'],
  },
  {
    icon: UserCheck, title: 'Member', color: '#059669', bg: '#ECFDF5',
    desc: 'Self-service portal — view your chit status, payment history, draw results, and payout schedule.',
    features: ['View all your chit groups', 'Download payment receipts', 'Track your payout date', 'Get notified on draw results'],
  },
];

const STEPS = [
  { num: '01', title: 'Register your organization', desc: 'Create your account with chit fund details and choose a plan — takes under 2 minutes.' },
  { num: '02', title: 'We migrate your existing chit groups', desc: 'Our team imports running chits, member ledgers, draw history, and payment records — zero disruption to your collections cycle.' },
  { num: '03', title: 'Go live the same week', desc: 'Your admin and staff manage collections digitally. Members get their own portal immediately.' },
];

const SIDEBAR_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',  active: true },
  { icon: Users,           label: 'Members',    active: false },
  { icon: BookOpen,        label: 'Chits',      active: false },
  { icon: CreditCard,      label: 'Payments',   active: false },
  { icon: Banknote,        label: 'Payouts',    active: false },
  { icon: Shuffle,         label: 'Draws',      active: false },
  { icon: BarChart2,       label: 'Reports',    active: false },
  { icon: Wallet,          label: 'Treasury',   active: false },
  { icon: Briefcase,       label: 'Team',       active: false },
];

const MEMBER_TABS = [
  { label: 'Home',     icon: LayoutDashboard, active: true,  color: P },
  { label: 'Chits',   icon: Layers,           active: false, color: '#7C3AED' },
  { label: 'Payouts', icon: Trophy,           active: false, color: '#D4A017' },
  { label: 'Payments',icon: CreditCard,       active: false, color: '#16A34A' },
  { label: 'Pickups', icon: Banknote,         active: false, color: '#EA580C' },
];

const DRAW_ROWS = [
  { name: 'Venkatesh R.',  draw: 8, amount: '₹5,000', status: 'Collected', color: '#22C55E', bg: '#F0FDF4' },
  { name: 'Padmavathi K.', draw: 8, amount: '₹5,000', status: 'Pending',   color: '#D97706', bg: '#FFFBEB' },
  { name: 'Suresh Babu',   draw: 8, amount: '₹5,000', status: 'Collected', color: '#22C55E', bg: '#F0FDF4' },
  { name: 'Anitha Devi',   draw: 8, amount: '₹5,000', status: 'Cash',      color: '#7C3AED', bg: '#F5F3FF' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [planCards, setPlanCards] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('GROWTH');
  const planScrollRef = useRef(null);
  const [planCanLeft, setPlanCanLeft] = useState(false);
  const [planCanRight, setPlanCanRight] = useState(true);

  useEffect(() => {
    const handler = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    getPublicPlans()
      .then(data => { if (data?.length) setPlanCards(data.map(p => apiPlanToCard(p, data))); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = planScrollRef.current;
    if (!el) return;
    const check = () => {
      setPlanCanLeft(el.scrollLeft > 4);
      setPlanCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [planCards]);

  const navScrolled = scrollY > 60;

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* ── Sticky Nav ── */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-8 py-4"
        animate={{
          backgroundColor: navScrolled ? 'rgba(255,255,255,0.93)' : 'transparent',
          borderBottom: navScrolled ? '1px solid rgba(0,0,0,0.06)' : '1px solid transparent',
        }}
        style={{ backdropFilter: navScrolled ? 'blur(16px)' : 'none' }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: P }}>
            <BookOpen size={28} className="text-white" />
          </div>
          <motion.span
            className="text-xl font-bold"
            animate={{ color: navScrolled ? P : 'white' }}
            transition={{ duration: 0.3 }}
            style={{ fontFamily: 'Merriweather, serif' }}
          >
            ChitWise
          </motion.span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <motion.button
            onClick={() => navigate('/login')}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer border"
            animate={{
              color: navScrolled ? P : 'white',
              borderColor: navScrolled ? 'rgba(30,58,95,0.25)' : 'rgba(255,255,255,0.3)',
              backgroundColor: navScrolled ? 'rgba(30,58,95,0.06)' : 'rgba(255,255,255,0.1)',
            }}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          >
            <LogIn size={14} /> Sign in
          </motion.button>
          <motion.button
            onClick={() => navigate('/register')}
            className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
            animate={{ backgroundColor: navScrolled ? P : 'white', color: navScrolled ? 'white' : P }}
            whileHover={{ scale: 1.04, opacity: 0.9 }} whileTap={{ scale: 0.96 }}
          >
            Get started
          </motion.button>
        </div>
      </motion.nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden" style={{ backgroundColor: P }}>
        <motion.div className="absolute w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,155,255,0.18) 0%, transparent 70%)', top: '-10%', left: '-10%' }}
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ repeat: Infinity, duration: 12, ease: 'easeInOut' }} />
        <motion.div className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.14) 0%, transparent 70%)', bottom: '5%', right: '5%' }}
          animate={{ x: [0, -30, 0], y: [0, -40, 0] }}
          transition={{ repeat: Infinity, duration: 15, ease: 'easeInOut', delay: 2 }} />

        <div className="relative z-10 max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full text-sm font-bold mb-8 border border-white/25"
            style={{ backgroundColor: 'rgba(255,255,255,0.13)', color: 'white' }}>
            <Star size={14} className="text-yellow-300 flex-shrink-0" />
            🇮🇳 Built by India, for India
            <span className="w-px h-4 bg-white/20" />
            <span className="font-medium text-white/75">First 6 months free · No credit card needed</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold text-white leading-none mb-6 sm:mb-8 tracking-tight"
            style={{ fontFamily: 'Merriweather, serif' }}>
            Chitfunds,<br /><span style={{ color: '#93C5FD' }}>digitized.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.55 }}
            className="text-base sm:text-xl text-white/70 max-w-2xl mx-auto leading-relaxed mb-8 sm:mb-12">
            The complete digital platform for chit fund businesses — member management, draw collections,
            payouts, and admin dashboards. We migrate your existing chit groups for free.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button onClick={() => navigate('/register')}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold cursor-pointer shadow-xl"
              style={{ backgroundColor: 'white', color: P }}
              whileHover={{ scale: 1.05, boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} whileTap={{ scale: 0.97 }}>
              Start free — 6 months on us <ArrowRight size={18} />
            </motion.button>
            <motion.button onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-medium cursor-pointer border border-white/30 text-white"
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)', scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <LogIn size={16} /> Already enrolled? Sign in
            </motion.button>
          </motion.div>
        </div>

        <motion.div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
          <span className="text-white/30 text-xs tracking-widest uppercase">Scroll</span>
          <ChevronDown size={20} className="text-white/30" />
        </motion.div>
      </section>

      {/* ── Problem: The Old Way ── */}
      <section className="py-16 sm:py-28 px-4 sm:px-8 overflow-hidden" style={{ backgroundColor: '#FDFBF7' }}>
        <div className="max-w-6xl mx-auto">

          {/* Headline */}
          <Reveal>
            <p className="text-center text-base sm:text-lg font-extrabold uppercase tracking-wider text-amber-600 mb-4">Sound familiar?</p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900 text-center leading-tight mb-5"
              style={{ fontFamily: 'Merriweather, serif' }}>
              Running a chit fund on<br />pen & paper — year after year.
            </h2>
            <p className="text-center text-gray-500 text-base sm:text-lg max-w-2xl mx-auto mb-14 leading-relaxed">
              Every draw day: pull out the ledger, call each member one by one, count cash, update entries, fix mistakes — then do it all over again next month, for every chit group you run.
            </p>
          </Reveal>

          {/* Before / After side-by-side narrative */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16 items-start">

            {/* Old Way — paper ledger mockup */}
            <Reveal dir="left">
              <div className="rounded-3xl overflow-hidden border-2 border-amber-200 shadow-lg">
                {/* Header */}
                <div className="px-5 py-3 flex items-center gap-3" style={{ backgroundColor: '#F5E6C8' }}>
                  <BookMarked size={16} className="text-amber-700" />
                  <span className="text-sm font-bold text-amber-800">The Old Way</span>
                  <span className="ml-auto text-xs text-amber-600 italic">Every. Single. Month.</span>
                </div>
                {/* Ledger lines */}
                <div className="p-5 space-y-2" style={{ backgroundColor: '#FFFDF4', backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #E5D9B6 27px, #E5D9B6 28px)' }}>
                  {[
                    { name: 'Ramesh K.',   note: 'paid ₹5,000 ✓',                      status: 'ok'   },
                    { name: 'Lakshmi D.', note: 'not picked up — call again??',          status: 'warn' },
                    { name: 'Suresh B.',  note: 'paid partial ₹3,000 · rest tomorrow',  status: 'warn' },
                    { name: 'Anitha R.', note: 'paid ₹5,000 ✓',                         status: 'ok'   },
                    { name: 'Venkat M.', note: '❌ NOT PAID — 2nd reminder',             status: 'bad'  },
                    { name: 'Padma S.',  note: 'says she paid to Ravi?? check w/ him',  status: 'bad'  },
                    { name: 'Govind R.', note: 'paid ₹5,000 ✓',                         status: 'ok'   },
                    { name: 'Priya T.',  note: 'cash not counted yet, check tomorrow',  status: 'warn' },
                    { name: 'Mohan K.',  note: 'says he gave to Govind — call both!!',  status: 'bad'  },
                    { name: 'Srinivas P.', note: '❌ 3rd time unpaid — take action?',   status: 'bad'  },
                  ].map((row, i) => (
                    <motion.div
                      key={row.name}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: false }}
                      transition={{ delay: 0.05 + i * 0.07, duration: 0.4 }}
                      className="flex items-start gap-3 py-0.5"
                    >
                      <div className="w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5"
                        style={{ borderColor: row.status === 'ok' ? '#16A34A' : row.status === 'warn' ? '#D97706' : '#DC2626',
                          backgroundColor: row.status === 'ok' ? '#F0FDF4' : row.status === 'warn' ? '#FFFBEB' : '#FEF2F2' }}>
                        {row.status === 'ok' && <Check size={11} className="text-green-600 m-auto mt-0.5" />}
                        {row.status === 'bad' && <X size={11} className="text-red-600 m-auto mt-0.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-gray-800" style={{ fontFamily: 'Georgia, serif' }}>{row.name}</span>
                        <span className="text-xs text-gray-500 ml-2 italic" style={{ fontFamily: 'Georgia, serif' }}>{row.note}</span>
                      </div>
                    </motion.div>
                  ))}
                  <div className="pt-3 border-t border-amber-200">
                    <p className="text-xs text-amber-700 italic" style={{ fontFamily: 'Georgia, serif' }}>
                      * Confirm Padma &amp; Mohan's cash · Call Venkat again · Fix total before draw · Ravi — where is the ₹5,000???
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Pain points list */}
            <Reveal dir="right" delay={0.1}>
              <div className="space-y-5 pt-2">
                {[
                  {
                    icon: PenLine,
                    color: '#D97706',
                    bg: '#FFFBEB',
                    title: 'Manual registers for every chit group',
                    desc: '20 members × 12 draws = 240 manual entries per chit group. One wrong entry and members start questioning your records.',
                  },
                  {
                    icon: Phone,
                    color: '#DC2626',
                    bg: '#FEF2F2',
                    title: '"Bhai, did my payment get noted?"',
                    desc: 'Members call at odd hours asking about their installment, their draw date, or the prize amount. You stop everything to answer.',
                  },
                  {
                    icon: Clock,
                    color: '#7C3AED',
                    bg: '#F5F3FF',
                    title: 'Draw day takes the entire day',
                    desc: 'Collecting from 20–50 members, tallying cash, running the draw, updating everyone — a full day gone, every single month.',
                  },
                  {
                    icon: AlertTriangle,
                    color: '#059669',
                    bg: '#ECFDF5',
                    title: 'No way to grow beyond a point',
                    desc: "Running 5 chit groups? Manageable. 15 groups with 300+ members? The paperwork alone stops you from scaling.",
                  },
                ].map(({ icon: Icon, color, bg, title, desc }, i) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, x: 30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: false }}
                    transition={{ delay: 0.1 + i * 0.12, duration: 0.5 }}
                    className="flex gap-4 p-5 rounded-2xl border border-gray-100 bg-white shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
                      <Icon size={18} style={{ color }} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-1">{title}</h4>
                      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Transition */}
          <Reveal>
            <div className="relative text-center py-8">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-white font-bold shadow-xl text-lg"
                style={{ backgroundColor: P }}>
                <Smartphone size={20} />
                ChitWise ends all of this.
                <ArrowRight size={20} />
              </div>
            </div>
          </Reveal>

          {/* The smart way — 3 solution cards with distinct backgrounds */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
            {[
              {
                icon: LayoutDashboard,
                cardBg: P,
                iconBg: 'rgba(255,255,255,0.15)',
                iconColor: 'white',
                titleColor: 'white',
                descColor: 'rgba(255,255,255,0.75)',
                dividerColor: 'rgba(255,255,255,0.15)',
                checkColor: '#86EFAC',
                badgeColor: '#BBF7D0',
                title: 'Everything in one dashboard',
                desc: 'All your chit groups, members, payments, draws, and payouts — visible in one place, updated in real time. No registers, no tallying.',
              },
              {
                icon: MessageCircle,
                cardBg: '#059669',
                iconBg: 'rgba(255,255,255,0.15)',
                iconColor: 'white',
                titleColor: 'white',
                descColor: 'rgba(255,255,255,0.75)',
                dividerColor: 'rgba(255,255,255,0.15)',
                checkColor: '#A7F3D0',
                badgeColor: '#D1FAE5',
                title: 'Members check themselves',
                desc: 'Every member gets their own portal. They check their installments, draw status, and payout date themselves — without calling you.',
              },
              {
                icon: TrendingUp,
                cardBg: '#7C3AED',
                iconBg: 'rgba(255,255,255,0.15)',
                iconColor: 'white',
                titleColor: 'white',
                descColor: 'rgba(255,255,255,0.75)',
                dividerColor: 'rgba(255,255,255,0.15)',
                checkColor: '#C4B5FD',
                badgeColor: '#EDE9FE',
                title: 'Scale without the paperwork',
                desc: 'Run 50 chit groups the same way you run 5. ChitWise handles the tracking so you can focus on growing your business.',
              },
            ].map(({ icon: Icon, cardBg, iconBg, iconColor, titleColor, descColor, dividerColor, checkColor, badgeColor, title, desc }, i) => (
              <Reveal key={title} delay={i * 0.12}>
                <motion.div
                  className="rounded-3xl p-7 shadow-lg h-full flex flex-col"
                  style={{ backgroundColor: cardBg }}
                  whileHover={{ y: -6, boxShadow: '0 24px 48px rgba(0,0,0,0.18)' }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 flex-shrink-0" style={{ backgroundColor: iconBg }}>
                    <Icon size={20} style={{ color: iconColor }} />
                  </div>
                  <h3 className="text-base font-bold mb-2" style={{ color: titleColor }}>{title}</h3>
                  <p className="text-sm leading-relaxed flex-1" style={{ color: descColor }}>{desc}</p>
                  <div className="mt-4 pt-4 flex items-center gap-2" style={{ borderTop: `1px solid ${dividerColor}` }}>
                    <Check size={14} style={{ color: checkColor }} />
                    <span className="text-xs font-semibold" style={{ color: checkColor }}>Included in every plan</span>
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── What Goes Wrong ── */}
      <section className="py-16 sm:py-28 px-4 sm:px-8 overflow-hidden" style={{ backgroundColor: '#1A0A0A' }}>
        <div className="max-w-6xl mx-auto">

          <Reveal>
            <p className="text-center text-base sm:text-lg font-extrabold uppercase tracking-wider mb-4" style={{ color: '#FCA5A5' }}>
              When records break down
            </p>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white text-center leading-tight mb-5"
              style={{ fontFamily: 'Merriweather, serif' }}>
              Trust is the first thing<br /><span style={{ color: '#F87171' }}>a chit fund loses.</span>
            </h2>
            <p className="text-center text-base sm:text-lg max-w-2xl mx-auto mb-14 leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Without a digital record, any small dispute becomes a big problem. Here's what chit fund organizers deal with every year — and why members lose faith.
            </p>
          </Reveal>

          <div className="mb-16">
            <ProblemsSlider />
          </div>

          {/* Transition to solution */}
          <Reveal>
            <div className="relative text-center py-8">
              <div className="absolute inset-0 flex items-center"><div className="w-full" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} /></div>
              <div className="relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold shadow-xl text-base"
                style={{ backgroundColor: 'white', color: P }}>
                <Shield size={18} />
                ChitWise creates a digital audit trail for every rupee.
                <ArrowRight size={18} />
              </div>
            </div>
          </Reveal>

          {/* 3 protection cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
            {[
              {
                icon: FileText,
                iconColor: '#93C5FD',
                title: 'Every payment is timestamped',
                desc: 'Digital receipts generated instantly. Who paid, how much, when, and which draw — all recorded. Only your organisation can access member payment data.',
                note: '🔒 Encrypted in transit & at rest',
              },
              {
                icon: Trophy,
                iconColor: '#FCD34D',
                title: 'Draw results on record forever',
                desc: 'Every draw — winner, dividend, admin commission, and disbursement — logged with full history. Fully isolated to your organisation, protected by role-based access controls.',
                note: '🔒 Your organisation only — fully isolated',
              },
              {
                icon: Shield,
                iconColor: '#6EE7B7',
                title: 'No cash can go unaccounted',
                desc: 'Staff cash collections go through pickup requests — requested, confirmed, reconciled. Every rupee has a trail. Your records are encrypted and private to your team.',
                note: '🔒 No gaps, no disputes, no exposure',
              },
            ].map(({ icon: Icon, iconColor, title, desc, note }, i) => (
              <Reveal key={title} delay={i * 0.12}>
                <motion.div
                  className="rounded-3xl p-7 h-full flex flex-col"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)', y: -4 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                    <Icon size={20} style={{ color: iconColor }} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm leading-relaxed flex-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{desc}</p>
                  <div className="mt-5 pt-4 text-xs font-semibold" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(147,197,253,0.8)' }}>
                    {note}
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>

          {/* Encryption assurance banner */}
          <Reveal delay={0.3}>
            <div className="mt-10 rounded-2xl px-6 py-5 flex items-start gap-4"
              style={{ backgroundColor: 'rgba(147,197,253,0.07)', border: '1px solid rgba(147,197,253,0.15)' }}>
              <Lock size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#93C5FD' }} />
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                <span className="font-semibold text-white">Encrypted in transit and at rest.</span>{' '}
                Your organisation's data is fully isolated — members, payments, draw records, and reports are visible only to your admin and staff (limited access).
                No other organisation can access your data. Access within ChitWise is governed by strict role-based controls.
              </p>
            </div>
          </Reveal>

        </div>
      </section>

      {/* ── India Chit Fund Industry Stats ── */}
      <section className="py-14 sm:py-20 px-4 sm:px-8 overflow-hidden" style={{ backgroundColor: '#0F2340' }}>
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(147,197,253,0.7)' }}>
              The scale of chit funds in India
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-2" style={{ fontFamily: 'Merriweather, serif' }}>
              Chit funds are not a small business. They are India's oldest financial system.
            </h2>
            <p className="text-center text-sm mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Trusted by crores of families across the country — but most still run on paper.
            </p>
            <p className="text-center text-xs font-semibold mb-12" style={{ color: 'rgba(147,197,253,0.6)' }}>
              🇮🇳 ChitWise is an Indian-owned platform, built specifically for India's chit fund businesses.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { val: 'Centuries old', label: "India's chit fund tradition", sub: 'predating modern banking by generations' },
              { val: 'Every state',   label: 'Chit funds exist across all of India', sub: 'from Tamil Nadu to Rajasthan, in every community' },
              { val: '₹500–₹10L',    label: 'Accessible at every income level', sub: 'from small neighbourhood groups to large registered companies' },
              { val: 'Still on paper', label: 'How most chit funds run today', sub: 'ChitWise is built to change exactly this' },
            ].map(({ val, label, sub }, i) => (
              <Reveal key={label} delay={i * 0.1}>
                <p className="text-3xl sm:text-4xl font-extrabold mb-2" style={{ color: '#93C5FD' }}>{val}</p>
                <p className="text-xs font-semibold text-white leading-snug mb-1">{label}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Value pillars ── */}
      <section className="py-12 sm:py-16 border-b border-gray-100" style={{ backgroundColor: '#F8FAFD' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-10 text-center">
          {[
            { val: '₹0', label: 'To get started' },
            { val: '3', label: 'Role portals included' },
            { val: '6 mo', label: 'Free on any plan' },
            { val: '∞', label: 'Migration support' },
          ].map(({ val, label }, i) => (
            <Reveal key={label} delay={i * 0.1}>
              <p className="text-4xl font-extrabold mb-1" style={{ color: P }}>{val}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Portals section ── */}
      <section className="py-16 sm:py-32 px-4 sm:px-8 max-w-6xl mx-auto">
        <Reveal>
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Role-based access</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 text-center leading-snug mb-4"
            style={{ fontFamily: 'Merriweather, serif' }}>
            Separate portals for<br /><span style={{ color: P }}>every role.</span>
          </h2>
          <p className="text-center text-gray-500 text-base sm:text-lg max-w-2xl mx-auto mb-10 sm:mb-16 leading-relaxed">
            Each user logs in to their own tailored experience — admin controls, field tools for staff, and a clean self-service portal for members.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PORTALS.map(({ icon: Icon, title, color, bg, desc, features }, i) => (
            <Reveal key={title} delay={i * 0.12}>
              <motion.div className="rounded-3xl p-8 border border-gray-100 h-full flex flex-col bg-white shadow-sm"
                whileHover={{ y: -6, boxShadow: '0 24px 48px rgba(0,0,0,0.08)' }} transition={{ duration: 0.3 }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 flex-shrink-0" style={{ backgroundColor: bg }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-6">{desc}</p>
                <ul className="space-y-2.5 mt-auto">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-600">
                      <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.4}>
          <p className="text-center text-sm text-gray-400 mt-10">
            All three portals included in every plan — no add-ons needed.
          </p>
        </Reveal>
      </section>

      {/* ── Feature 1 — Migration ── */}
      <section className="py-16 sm:py-32 px-4 sm:px-8" style={{ backgroundColor: '#F8FAFD' }}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
          <Reveal dir="left">
            <div className="relative rounded-3xl p-10 min-h-80 flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#EFF4FA' }}>
              <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                <RefreshCw size={220} style={{ color: P }} />
              </div>
              <div className="relative z-10 w-full max-w-xs space-y-3">
                {[
                  { label: 'Active chit groups (12)', tag: 'Migrated' },
                  { label: 'Member ledger (248)',      tag: 'Migrated' },
                  { label: 'Draw history (7 draws)',   tag: 'Migrated' },
                  { label: 'Payment records (₹34L)',   tag: 'Migrated' },
                ].map((item, i) => (
                  <motion.div key={item.label}
                    initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false }}
                    transition={{ delay: 0.2 + i * 0.12, duration: 0.5 }}
                    className="flex items-center gap-3 bg-white rounded-2xl px-5 py-3 shadow-sm"
                    style={{ transform: `translateX(${i % 2 === 0 ? '0' : '14px'})` }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#DCFCE7' }}>
                      <Check size={13} className="text-green-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 flex-1">{item.label}</span>
                    <span className="text-xs text-green-600 font-semibold">{item.tag}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal dir="right" delay={0.15}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6" style={{ backgroundColor: '#EFF4FA', color: P }}>
              <RefreshCw size={12} /> Zero-downtime migration
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-snug mb-6" style={{ fontFamily: 'Merriweather, serif' }}>
              Already running chit groups?<br /><span style={{ color: P }}>We move them for you.</span>
            </h2>
            <p className="text-gray-500 text-lg leading-relaxed mb-8">
              Our team imports your running chit groups, member ledgers, draw history, and full payment records —
              with zero disruption to your next collection draw.
            </p>
            <ul className="space-y-4">
              {[
                'All chit group balances & dividend calculations transferred',
                'Member records linked to app login automatically',
                'Forfeited dividend history fully preserved',
                'Your admin team trained and ready before go-live',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-600 text-sm">
                  <Check size={16} className="flex-shrink-0 mt-0.5 text-green-500" />{item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ── Feature Slider ── */}
      <section className="py-16 sm:py-24 px-4 sm:px-8" style={{ backgroundColor: P }}>
        <div className="max-w-7xl mx-auto">
          <FeatureSlider />
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-16 sm:py-32 px-4 sm:px-8 max-w-5xl mx-auto">
        <Reveal>
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">How it works</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 text-center leading-snug mb-20"
            style={{ fontFamily: 'Merriweather, serif' }}>
            Up and running<br /><span style={{ color: P }}>in under a week.</span>
          </h2>
        </Reveal>
        <div className="space-y-16">
          {STEPS.map(({ num, title, desc }, i) => (
            <Reveal key={num} delay={i * 0.15} dir="right">
              <div className="flex gap-8 items-start">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-extrabold flex-shrink-0"
                  style={{ backgroundColor: '#EFF4FA', color: P }}>
                  {num}
                </div>
                <div className="pt-3">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Trust & Security ── */}
      <section className="py-16 sm:py-24 px-4 sm:px-8 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest mb-4" style={{ color: P }}>Security & Privacy</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 text-center leading-snug mb-3" style={{ fontFamily: 'Merriweather, serif' }}>
              Your data stays yours. Always.
            </h2>
            <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
              Your organisation's data stays isolated. Members, payments, draw records, and reports are protected by role-based access controls and are not accessible to other organisations. ChitWise support personnel may access data only when necessary to provide support and with appropriate authorisation.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                icon: Shield,
                title: 'Encrypted in transit & at rest',
                desc: 'Every connection to ChitWise is over HTTPS. Your data is encrypted on our servers — no plain-text records, ever.',
              },
              {
                icon: Building2,
                title: 'Your organisation, fully isolated',
                desc: "Each org's data lives in its own isolated space. One organisation can never access another's members or transactions — by design.",
              },
              {
                icon: FileText,
                title: 'You are in control',
                desc: 'Export your full data anytime. Your records belong to your organisation, not to us. Leave whenever you want — with everything.',
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <Reveal key={title} delay={i * 0.08}>
                <div className="flex gap-4 p-6 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF4FA' }}>
                    <Icon size={18} style={{ color: P }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-16 sm:py-32 px-4 sm:px-8" style={{ backgroundColor: P }}>
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-center text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: 'rgba(255,255,255,0.45)' }}>Pricing</p>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white text-center leading-snug mb-4"
              style={{ fontFamily: 'Merriweather, serif' }}>
              Simple, honest pricing.
            </h2>
            <p className="text-center text-white/60 mb-8 text-lg max-w-xl mx-auto">
              Pay monthly. Upgrade anytime. No hidden fees.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="flex justify-center mb-12">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl font-semibold text-sm"
                style={{ backgroundColor: '#22C55E', color: 'white' }}>
                <span className="text-base">🎉</span>
                <span>Introductory offer — first 6 months free on any plan</span>
              </div>
            </div>
          </Reveal>
          {planCards.length > 0 ? (
            <div className="relative">
              {planCanLeft && (
                <button type="button" onClick={() => planScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
                  className="absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer"
                  style={{
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
                  }}>
                  <ChevronLeft size={20} className="text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
                </button>
              )}
              {planCanRight && (
                <button type="button" onClick={() => planScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
                  className="absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer"
                  style={{
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
                  }}>
                  <ChevronRight size={20} className="text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
                </button>
              )}
            <div ref={planScrollRef} className="flex items-stretch gap-6 overflow-x-auto pb-4 -mx-2 px-2" style={{ scrollbarWidth: 'none' }}>
              {planCards.map(({ plan, label, tagline, price, sub, badge, features, isCustom }, i) => {
                const active = plan === selectedPlan;
                return (
                <Reveal key={plan} delay={i * 0.1} className="flex-shrink-0 flex flex-col">
                  <motion.div
                    onClick={() => setSelectedPlan(plan)}
                    style={{ minWidth: 260, ...(active ? { transform: 'scale(1.04)', transformOrigin: 'center' } : {}) }}
                    className={`relative rounded-3xl p-7 flex flex-col cursor-pointer flex-1 ${
                      active ? 'bg-white shadow-2xl' :
                      isCustom ? 'bg-white/5 border-2 border-dashed border-white/20' : 'bg-white/10 border border-white/20'
                    }`}
                    whileHover={{ y: -5 }} transition={{ duration: 0.3 }}>
                    {badge && (
                      <span className="absolute -top-3.5 left-6 px-4 py-1 rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: '#22C55E' }}>{badge}</span>
                    )}
                    <div className="mb-6">
                      <p className="text-xl font-bold mb-1" style={{ color: active ? P : 'white' }}>{label}</p>
                      <p className="text-sm mb-5" style={{ color: active ? '#9CA3AF' : 'rgba(255,255,255,0.5)' }}>{tagline}</p>
                      <p className="text-3xl font-extrabold" style={{ color: active ? '#111827' : 'white' }}>{price}</p>
                      <p className="text-xs mt-1" style={{ color: active ? '#9CA3AF' : 'rgba(255,255,255,0.4)' }}>{sub}</p>
                    </div>
                    <ul className="space-y-3 flex-1 mb-8">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Check size={14} className="flex-shrink-0 mt-0.5"
                            style={{ color: active ? P : 'rgba(255,255,255,0.55)' }} />
                          <span className="text-sm" style={{ color: active ? '#4B5563' : 'rgba(255,255,255,0.7)' }}>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); navigate(`/register?plan=${plan}`); }}
                      className="w-full py-3.5 rounded-xl text-sm font-bold cursor-pointer"
                      style={active
                        ? { backgroundColor: P, color: 'white' }
                        : { border: '1px solid rgba(255,255,255,0.3)', color: 'white', backgroundColor: 'transparent' }}
                      whileHover={{ opacity: 0.88 }} whileTap={{ scale: 0.97 }}>
                      {isCustom ? 'Talk to us' : 'Get started'}
                    </motion.button>
                  </motion.div>
                </Reveal>
                );
              })}
            </div>
            </div>
          ) : (
            <div className="text-center text-white/40 py-12">Loading plans…</div>
          )}
          <Reveal delay={0.4}>
            <p className="text-center text-white/40 text-sm mt-10">
              For a custom plan, our sales support team will contact you to design a plan that works best for your organization.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Support ── */}
      <section className="py-14 sm:py-24 px-4 sm:px-8 max-w-4xl mx-auto text-center">
        <Reveal>
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#EFF4FA' }}>
              <Headphones size={22} style={{ color: P }} />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Merriweather, serif' }}>
            We're with you at every draw
          </h3>
          <p className="text-gray-500 leading-relaxed max-w-2xl mx-auto">
            From registering your first chit group to migrating live ones — we guide your admin team through setup,
            train your staff, and stay available as your member base grows.
          </p>
        </Reveal>
      </section>

      {/* ── About ── */}
      <section className="py-16 sm:py-28 px-4 sm:px-8 border-t border-gray-100" style={{ backgroundColor: '#FDFBF7' }}>
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <p className="text-xs font-bold tracking-widest uppercase mb-5" style={{ color: P }}>About ChitWise</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-snug mb-10" style={{ fontFamily: 'Merriweather, serif' }}>
              Built for the people who run<br />India's chit-fund businesses.
            </h2>
          </Reveal>
          <div className="space-y-5">
            <Reveal delay={0.1}>
              <p className="text-lg text-gray-600 leading-relaxed">
                ChitWise started as a personal project. My mother runs chit funds — keeping paper ledgers,
                chasing payments, reconciling draw records by hand. I built the first version just for her.
              </p>
            </Reveal>
            <Reveal delay={0.13}>
              <p className="text-lg text-gray-600 leading-relaxed">
                Every problem you saw on this page — the payment disputes, the missing records, the arguments
                at draw time — my parents dealt with all of it. Not as examples. As their actual life.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <p className="text-lg text-gray-600 leading-relaxed">
                Then I realised: their problem isn't unique. Thousands of chit-fund organisers across India
                are running businesses that move crores of rupees, still on notebooks and WhatsApp threads.
                ChitWise exists to change that.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="text-lg text-gray-600 leading-relaxed">
                That origin is also why our pricing is what it is — accessible enough that the organiser
                running 20 chits from a small town can use the same tools as a registered company managing 200.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.25}>
            <div className="mt-10 pt-8 border-t border-gray-200 flex items-center gap-4">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                style={{ backgroundColor: P }}>
                S
              </div>
              <div>
                <p className="font-semibold text-gray-900">Sai Srinivas Gada</p>
                <p className="text-sm text-gray-500">Founder · ChitWise</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative py-24 sm:py-40 px-4 sm:px-8 text-center overflow-hidden" style={{ backgroundColor: P }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(46,80,144,0.9) 0%, transparent 100%)' }} />
        <div className="relative z-10 max-w-3xl mx-auto">
          <Reveal>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight mb-6"
              style={{ fontFamily: 'Merriweather, serif' }}>
              Your chit fund,<br /><span style={{ color: '#93C5FD' }}>fully digital.</span>
            </h2>
            <p className="text-white/70 text-base sm:text-xl mb-10 sm:mb-12 leading-relaxed">
              Register today. We migrate your chit groups, onboard your admin team,
              and get you live — all within a week.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.button onClick={() => navigate('/register')}
                className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-lg font-bold cursor-pointer shadow-xl"
                style={{ backgroundColor: 'white', color: P }}
                whileHover={{ scale: 1.05, boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }} whileTap={{ scale: 0.97 }}>
                Join ChitWise — it's free <ArrowUpRight size={20} />
              </motion.button>
              <motion.button onClick={() => navigate('/login')}
                className="inline-flex items-center gap-2 px-8 py-5 rounded-2xl text-lg font-medium cursor-pointer border border-white/30 text-white"
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }} whileTap={{ scale: 0.97 }}>
                <LogIn size={18} /> Already enrolled? Sign in
              </motion.button>
            </div>
            <p className="text-white/40 text-sm mt-8">No credit card · 6 months free · Migration included · All portals included</p>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 sm:py-12 px-4 sm:px-8 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: P }}>
              <BookOpen size={15} className="text-white" />
            </div>
            <span className="font-bold text-gray-700" style={{ fontFamily: 'Merriweather, serif' }}>ChitWise</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/login')} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer">Sign in</button>
            <button onClick={() => navigate('/register')} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer">Register</button>
            <button onClick={() => navigate('/privacy')} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer">Privacy Policy</button>
            <button onClick={() => navigate('/terms')} className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer">Terms</button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-6 text-center space-y-1">
          <p className="text-sm text-gray-400">© {new Date().getFullYear()} ChitWise</p>
          <p className="text-xs text-gray-400">🇮🇳 Indian-owned · Built for India's chit fund businesses</p>
          <p className="text-xs text-gray-400">For any enquiries: <a href="mailto:help@thechitwise.com" className="text-gray-500 hover:text-gray-700 underline">help@thechitwise.com</a></p>
        </div>
      </footer>
    </div>
  );
}
