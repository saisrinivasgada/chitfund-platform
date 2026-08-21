import { useState, useCallback } from 'react';
import RoleBadge from './ui/RoleBadge';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getTodaysPaymentBatches, getTodaysDraws, getTodaysPayouts,
  getTodaysChitActivity, listStaff, getMembers, getChits,
} from '../services/api';
import { useHiddenAmounts } from '../hooks/useHiddenAmounts';
import {
  Banknote, CreditCard, CheckCircle, XCircle,
  ArrowDownCircle, Clock, SkipForward, Gift, Ban,
  RefreshCw, ChevronDown, ChevronRight, ExternalLink,
  Play, PauseCircle, Trophy, Zap, AlertCircle, X,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtAmt(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
}

function nm(map, id) {
  return map[id] ?? '—';
}

const MODE_LABEL = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque' };

const CHIT_STATUS_CONFIG = {
  ACTIVE:    { label: 'Activated',  icon: Play,        color: 'text-green-600',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700' },
  PAUSED:    { label: 'Paused',     icon: PauseCircle, color: 'text-amber-600',  bg: 'bg-amber-50',  badge: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: 'Completed',  icon: Trophy,      color: 'text-blue-600',   bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-700' },
  CANCELLED: { label: 'Cancelled',  icon: AlertCircle, color: 'text-red-500',    bg: 'bg-red-50',    badge: 'bg-red-100 text-red-600' },
  DRAFT:     { label: 'Edited',     icon: Zap,         color: 'text-gray-500',   bg: 'bg-gray-50',   badge: 'bg-gray-100 text-gray-600' },
};

// ── Collapsible section ────────────────────────────────────────────────────

function SectionCard({ icon: Icon, iconColor, iconBg, title, subtitle, count, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-gray-50/60 hover:bg-gray-100/60 transition-colors cursor-pointer text-left"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={15} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{title}</span>
            {count !== undefined && count > 0 && (
              <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{count}</span>
            )}
            {badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>{count === 1 ? '1 item' : `${count} items`}</span>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {open
          ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
          : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
      </button>
      {open && <div className="divide-y divide-gray-50">{children}</div>}
    </div>
  );
}

const HIDDEN = '••••••';

// ── Dismiss button ─────────────────────────────────────────────────────────

function DismissBtn({ onDismiss }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDismiss(); }}
      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer ml-1"
      title="Clear this item"
    >
      <X size={12} />
    </button>
  );
}

// ── Payment batch row ──────────────────────────────────────────────────────

function BatchRow({ batch, staffMap, memberMap, chitMap, chits, hidden, onDismiss }) {
  const navigate = useNavigate();
  const member = nm(memberMap, batch.memberId);
  const chit = chits.find((c) => c.id === batch.chitId);
  const chitName = chit?.name ?? nm(chitMap, batch.chitId);
  const collector = nm(staffMap, batch.collectedBy);
  const alloc = batch.allocations ?? [];
  const draws = alloc.map((a) => `#${a.monthNumber}`).join(', ');

  return (
    <div
      onClick={() => navigate(`/transactions/${batch.id}`)}
      className="flex items-start gap-3 px-5 py-3 bg-white hover:bg-blue-50/30 transition-colors cursor-pointer group"
    >
      <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Banknote size={14} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{member}</span>
          <span className="text-xs text-gray-500">{chitName}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            batch.paymentMode === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {MODE_LABEL[batch.paymentMode] ?? batch.paymentMode}
          </span>
          {batch.status === 'AWAITING_REMITTANCE' && (
            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Pending remittance</span>
          )}
          {batch.status === 'VOIDED' && (
            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Voided</span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {draws && <span>Draw {draws} · </span>}
          by {collector} · {fmtTime(batch.collectedAt ?? batch.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-sm font-bold text-gray-800">{hidden ? HIDDEN : fmtAmt(batch.totalAmount)}</span>
        <ExternalLink size={12} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
        <DismissBtn onDismiss={onDismiss} />
      </div>
    </div>
  );
}

// ── Generic event row ──────────────────────────────────────────────────────

function EventRow({ icon: Icon, iconColor, iconBg, label, labelColor = 'text-gray-500', detail, sub, time, onDismiss }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5 bg-white">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
        <Icon size={14} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>{label}</span>
          {time && <span className="text-xs text-gray-300">· {time}</span>}
        </div>
        <p className="text-sm text-gray-900 mt-0.5 leading-snug">{detail}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {onDismiss && <DismissBtn onDismiss={onDismiss} />}
    </div>
  );
}

// ── Chit status row ────────────────────────────────────────────────────────

function ChitStatusRow({ chit, staffMap, onDismiss }) {
  const cfg = CHIT_STATUS_CONFIG[chit.status] ?? CHIT_STATUS_CONFIG.DRAFT;
  const Icon = cfg.icon;
  const actor = nm(staffMap, chit.updatedBy);
  const actorStr = chit.updatedBy ? ` by ${actor}` : '';

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 bg-white">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
        <Icon size={14} className={cfg.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.badge}`}>{chit.status}</span>
          <span className="text-xs text-gray-300">· {fmtTime(chit.updatedAt)}</span>
        </div>
        <p className="text-sm text-gray-900 mt-0.5 font-medium">{chit.name}</p>
        {actorStr && <p className="text-xs text-gray-400 mt-0.5">Changed{actorStr}</p>}
      </div>
      {onDismiss && <DismissBtn onDismiss={onDismiss} />}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TodaysActivityFeed() {
  const { hidden } = useHiddenAmounts();
  const [dismissed, setDismissed] = useState(new Set());
  const dismiss = useCallback((key) => setDismissed((prev) => new Set([...prev, key])), []);

  const { data: batches = [], isLoading: batchesLoading, refetch: refetchBatches } =
    useQuery({ queryKey: ['today-batches'], queryFn: getTodaysPaymentBatches, staleTime: 30_000 });

  const { data: draws = [], isLoading: drawsLoading, refetch: refetchDraws } =
    useQuery({ queryKey: ['today-draws'], queryFn: getTodaysDraws, staleTime: 30_000 });

  const { data: payouts = [], isLoading: payoutsLoading, refetch: refetchPayouts } =
    useQuery({ queryKey: ['today-payouts'], queryFn: getTodaysPayouts, staleTime: 30_000 });

  const { data: chitActivity = [], isLoading: chitLoading, refetch: refetchChits } =
    useQuery({ queryKey: ['today-chit-activity'], queryFn: getTodaysChitActivity, staleTime: 30_000 });

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: () => listStaff(), staleTime: 5 * 60_000 });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: () => getMembers({ size: 50 }), staleTime: 60_000 });
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits, staleTime: 30_000 });

  const isLoading = batchesLoading || drawsLoading || payoutsLoading || chitLoading;

  const staffMap = Object.fromEntries((staff ?? []).map((s) => [s.id, s.fullName ?? s.username ?? 'Staff']));
  const staffRoleMap = Object.fromEntries((staff ?? []).map((s) => [s.id, s.role ?? '']));
  const memberMap = Object.fromEntries(
    (members ?? []).flatMap((m) => {
      const name = m.fullName ?? m.name ?? 'Member';
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    })
  );
  const chitMap = Object.fromEntries((chits ?? []).map((c) => [c.id, c.name ?? c.id]));

  const collectedBatches = batches
    .filter((b) => b.status !== 'VOIDED' && !dismissed.has(`batch-${b.id}`));
  const remittedBatches  = batches
    .filter((b) => b.remittedAt && !dismissed.has(`remit-${b.id}`));
  const voidedBatches    = batches
    .filter((b) => b.status === 'VOIDED' && !dismissed.has(`void-${b.id}`));
  const totalCollected   = collectedBatches.reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);

  // Only show chits with meaningful status changes (exclude DRAFT name-edits if status is still DRAFT
  // and the chit was created in the feed window, since creation also triggers updatedAt)
  const chitStatusChanges = chitActivity.filter(
    (c) => (!dismissed.has(`chit-${c.id}`)) &&
    (c.status !== 'DRAFT' || new Date(c.createdAt).toDateString() !== new Date().toDateString())
  );

  const activeDrawEvents = draws.filter((d) => (d.skippedAt || d.openedAt) && !dismissed.has(`draw-${d.id}`));

  const filteredPayouts = payouts.filter((p) => !dismissed.has(`payout-${p.id}`));

  const hasActivity = collectedBatches.length > 0
    || activeDrawEvents.length > 0
    || filteredPayouts.length > 0
    || chitStatusChanges.length > 0;

  function refetchAll() {
    setDismissed(new Set());
    refetchBatches(); refetchDraws(); refetchPayouts(); refetchChits();
  }

  const amt = (v) => hidden ? HIDDEN : fmtAmt(v);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Today's Activity</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}last 12 hrs
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick count chips */}
          {!isLoading && (
            <div className="hidden sm:flex items-center gap-1.5">
              {collectedBatches.length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {collectedBatches.length} payment{collectedBatches.length !== 1 ? 's' : ''}
                </span>
              )}
              {activeDrawEvents.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {activeDrawEvents.length} draw event{activeDrawEvents.length !== 1 ? 's' : ''}
                </span>
              )}
              {chitStatusChanges.length > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  {chitStatusChanges.length} chit update{chitStatusChanges.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
          <button
            onClick={refetchAll}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Loading activity…
        </div>
      ) : !hasActivity ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Clock size={28} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium">No activity yet today</p>
          <p className="text-xs mt-1 text-gray-300">Payments, draws, and chit updates will appear here</p>
        </div>
      ) : (
        <div className="p-4 space-y-2.5">

          {/* ── Payments Collected ── */}
          {collectedBatches.length > 0 && (
            <SectionCard
              icon={Banknote}
              iconColor="text-amber-600"
              iconBg="bg-amber-50"
              title="Payments Collected"
              count={collectedBatches.length}
              subtitle={`${amt(totalCollected)} from ${collectedBatches.length} payment${collectedBatches.length !== 1 ? 's' : ''}`}
              defaultOpen={true}
            >
              {collectedBatches.map((b) => (
                <BatchRow
                  key={b.id}
                  batch={b}
                  staffMap={staffMap}
                  memberMap={memberMap}
                  chitMap={chitMap}
                  chits={chits}
                  hidden={hidden}
                  onDismiss={() => dismiss(`batch-${b.id}`)}
                />
              ))}
            </SectionCard>
          )}

          {/* ── Remittances confirmed ── */}
          {remittedBatches.length > 0 && (
            <SectionCard
              icon={CheckCircle}
              iconColor="text-green-600"
              iconBg="bg-green-50"
              title="Remittances Confirmed"
              count={remittedBatches.length}
              subtitle={`${amt(remittedBatches.reduce((s, b) => s + Number(b.totalAmount ?? 0), 0))} cash handed over`}
            >
              {remittedBatches.map((b) => (
                <EventRow
                  key={`remit-${b.id}`}
                  icon={CheckCircle}
                  iconColor="text-green-600"
                  iconBg="bg-green-50"
                  label="Remittance"
                  labelColor="text-green-600"
                  detail={`${nm(staffMap, b.remittedBy)} confirmed ${amt(b.totalAmount)} from ${nm(staffMap, b.collectedBy)}`}
                  sub={`Member: ${nm(memberMap, b.memberId)} · Chit: ${nm(chitMap, b.chitId)}`}
                  time={fmtTime(b.remittedAt)}
                  onDismiss={() => dismiss(`remit-${b.id}`)}
                />
              ))}
            </SectionCard>
          )}

          {/* ── Draw Activity ── */}
          {activeDrawEvents.length > 0 && (
            <SectionCard
              icon={ArrowDownCircle}
              iconColor="text-[#1E3A5F]"
              iconBg="bg-blue-50"
              title="Draw Activity"
              count={activeDrawEvents.length}
              subtitle={`${draws.filter((d) => d.openedAt && !d.closedAt).length} opened · ${draws.filter((d) => d.skippedAt).length} skipped`}
            >
              {draws.map((d) => {
                const chitName = nm(chitMap, d.chitId);
                const cycle = `${chitName} — Draw #${d.monthNumber}`;
                if (d.skippedAt) {
                  const skipperRole = staffRoleMap[d.skippedBy];
                  return (
                    <EventRow key={`skip-${d.id}`}
                      icon={SkipForward} iconColor="text-orange-500" iconBg="bg-orange-50"
                      label="Skipped" labelColor="text-orange-600"
                      detail={<span className="flex items-center gap-1.5 flex-wrap">{nm(staffMap, d.skippedBy)} {skipperRole && <RoleBadge role={skipperRole} />} skipped {cycle}</span>}
                      sub={d.skipReason}
                      time={fmtTime(d.skippedAt)}
                      onDismiss={() => dismiss(`draw-${d.id}`)} />
                  );
                }
                if (d.openedAt && !d.closedAt) {
                  const openerRole = staffRoleMap[d.openedBy];
                  return (
                    <EventRow key={`open-${d.id}`}
                      icon={ArrowDownCircle} iconColor="text-[#1E3A5F]" iconBg="bg-blue-50"
                      label="Opened" labelColor="text-blue-700"
                      detail={<span className="flex items-center gap-1.5 flex-wrap">{nm(staffMap, d.openedBy)} {openerRole && <RoleBadge role={openerRole} />} opened {cycle}</span>}
                      sub={d.dueDate ? `Due: ${d.dueDate}` : undefined}
                      time={fmtTime(d.openedAt)}
                      onDismiss={() => dismiss(`draw-${d.id}`)} />
                  );
                }
                return null;
              })}
            </SectionCard>
          )}

          {/* ── Chit Status Changes ── */}
          {chitStatusChanges.length > 0 && (
            <SectionCard
              icon={Zap}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
              title="Chit Updates"
              count={chitStatusChanges.length}
              subtitle="Status changes to chit funds"
            >
              {chitStatusChanges.map((c) => (
                <ChitStatusRow key={c.id} chit={c} staffMap={staffMap} onDismiss={() => dismiss(`chit-${c.id}`)} />
              ))}
            </SectionCard>
          )}

          {/* ── Payout Activity ── */}
          {filteredPayouts.length > 0 && (
            <SectionCard
              icon={Gift}
              iconColor="text-green-700"
              iconBg="bg-green-50"
              title="Payout Activity"
              count={filteredPayouts.length}
              subtitle={`${filteredPayouts.filter((p) => p.disbursedAt).length} disbursed · ${filteredPayouts.filter((p) => p.status === 'PENDING').length} pending`}
            >
              {filteredPayouts.map((p) => {
                const member = nm(memberMap, p.memberId);
                const chit = nm(chitMap, p.chitId);
                const payAmt = amt(p.netPayoutAmount);

                if (p.disbursedAt) return (
                  <EventRow key={`dis-${p.id}`}
                    icon={Gift} iconColor="text-green-700" iconBg="bg-green-50"
                    label="Disbursed" labelColor="text-green-700"
                    detail={`${nm(staffMap, p.disbursedBy)} paid ${payAmt} to ${member}`}
                    sub={`${chit} · Draw #${p.monthNumber}${p.disbursementMode ? ` via ${MODE_LABEL[p.disbursementMode] ?? p.disbursementMode}` : ''}${p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}`}
                    time={fmtTime(p.disbursedAt)}
                    onDismiss={() => dismiss(`payout-${p.id}`)} />
                );
                if (p.status === 'PENDING' && p.createdAt) return (
                  <EventRow key={`pend-${p.id}`}
                    icon={Clock} iconColor="text-orange-500" iconBg="bg-orange-50"
                    label="Payout Registered" labelColor="text-orange-600"
                    detail={`${nm(staffMap, p.createdBy)} registered ${payAmt} for ${member}`}
                    sub={`${chit} · Draw #${p.monthNumber} — awaiting disbursement`}
                    time={fmtTime(p.createdAt)}
                    onDismiss={() => dismiss(`payout-${p.id}`)} />
                );
                if (p.cancelledAt) return (
                  <EventRow key={`can-${p.id}`}
                    icon={Ban} iconColor="text-red-500" iconBg="bg-red-50"
                    label="Cancelled" labelColor="text-red-600"
                    detail={`${nm(staffMap, p.cancelledBy)} cancelled ${payAmt} for ${member}`}
                    sub={p.cancellationReason}
                    time={fmtTime(p.cancelledAt)}
                    onDismiss={() => dismiss(`payout-${p.id}`)} />
                );
                return null;
              })}
            </SectionCard>
          )}

          {/* ── Voided Payments ── */}
          {voidedBatches.length > 0 && (
            <SectionCard
              icon={XCircle}
              iconColor="text-red-500"
              iconBg="bg-red-50"
              title="Voided Payments"
              count={voidedBatches.length}
            >
              {voidedBatches.map((b) => (
                <EventRow
                  key={`void-${b.id}`}
                  icon={XCircle} iconColor="text-red-500" iconBg="bg-red-50"
                  label="Voided" labelColor="text-red-600"
                  detail={`${nm(staffMap, b.voidedBy)} voided ${amt(b.totalAmount)} from ${nm(memberMap, b.memberId)}`}
                  sub={b.voidReason ? `Reason: ${b.voidReason}` : undefined}
                  time={fmtTime(b.voidedAt ?? b.createdAt)}
                  onDismiss={() => dismiss(`void-${b.id}`)}
                />
              ))}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
