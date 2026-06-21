import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getTodaysPaymentBatches, getTodaysDraws, getTodaysPayouts,
  listStaff, getMembers, getChits,
} from '../services/api';
import { useHiddenAmounts } from '../hooks/useHiddenAmounts';
import {
  Banknote, CreditCard, CheckCircle, XCircle, BookOpen,
  ArrowDownCircle, Clock, SkipForward, Gift, Ban,
  RefreshCw, ChevronDown, ChevronRight, ExternalLink,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtAmt(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
}

function n(map, id) {
  return map[id] ?? 'Unknown';
}

const MODE_LABEL = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque' };

const CHIT_STATUS_COLOR = {
  ACTIVE: 'bg-green-500',
  COMPLETED: 'bg-blue-500',
  PAUSED: 'bg-amber-500',
  CANCELLED: 'bg-red-400',
  DRAFT: 'bg-gray-400',
};

// ── Collapsible section ────────────────────────────────────────────────────

function SectionCard({ icon: Icon, iconColor, iconBg, title, subtitle, count, children, defaultOpen = false }) {
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{title}</span>
            {count !== undefined && (
              <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{count}</span>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
               : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
      </button>
      {open && <div className="divide-y divide-gray-50">{children}</div>}
    </div>
  );
}

const HIDDEN = '••••••';

// ── Payment batch row (inside "Payments Collected" section) ────────────────

function BatchRow({ batch, staffMap, memberMap, chitMap, chits, hidden }) {
  const navigate = useNavigate();
  const member = n(memberMap, batch.memberId);
  const chit = chits.find((c) => c.id === batch.chitId);
  const chitName = chit?.name ?? n(chitMap, batch.chitId);
  const chitStatus = chit?.status ?? 'ACTIVE';
  const collector = n(staffMap, batch.collectedBy);
  const alloc = batch.allocations ?? [];
  const months = alloc.map((a) => `Draw #${a.monthNumber}`).join(', ');

  return (
    <div
      onClick={() => navigate(`/transactions/${batch.id}`)}
      className="flex items-start gap-3 px-5 py-3 bg-white hover:bg-blue-50/30 transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{member}</span>
          <span className="flex items-center gap-1 text-xs">
            <span className={`w-2 h-2 rounded-full ${CHIT_STATUS_COLOR[chitStatus] ?? 'bg-gray-400'}`} />
            <span className="text-gray-600">{chitName}</span>
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            batch.paymentMode === 'CASH'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {MODE_LABEL[batch.paymentMode] ?? batch.paymentMode}
          </span>
          {batch.status === 'AWAITING_REMITTANCE' && (
            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
              Pending remittance
            </span>
          )}
          {batch.status === 'VOIDED' && (
            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Voided</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {months && <span className="text-xs text-gray-400">{months}</span>}
          <span className="text-xs text-gray-400">by {collector}</span>
          <span className="text-xs text-gray-300">{fmtTime(batch.collectedAt ?? batch.createdAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-bold text-gray-800">{hidden ? HIDDEN : fmtAmt(batch.totalAmount)}</span>
        <ExternalLink size={13} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
      </div>
    </div>
  );
}

// ── Generic event row ──────────────────────────────────────────────────────

function EventRow({ icon: Icon, iconColor, iconBg, label, detail, sub, time }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5 bg-white">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
        <Icon size={15} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{time}</span>
        </div>
        <p className="text-sm text-gray-900 mt-0.5 leading-snug">{detail}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TodaysActivityFeed() {
  const { hidden } = useHiddenAmounts();

  const { data: batches = [], isLoading: batchesLoading, refetch: refetchBatches } =
    useQuery({ queryKey: ['today-batches'], queryFn: getTodaysPaymentBatches, staleTime: 60_000 });

  const { data: draws = [], isLoading: drawsLoading, refetch: refetchDraws } =
    useQuery({ queryKey: ['today-draws'], queryFn: getTodaysDraws, staleTime: 60_000 });

  const { data: payouts = [], isLoading: payoutsLoading, refetch: refetchPayouts } =
    useQuery({ queryKey: ['today-payouts'], queryFn: getTodaysPayouts, staleTime: 60_000 });

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: () => listStaff(), staleTime: 300_000 });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: getMembers, staleTime: 300_000 });
  const { data: chits = [] } = useQuery({ queryKey: ['chits'], queryFn: getChits, staleTime: 300_000 });

  const isLoading = batchesLoading || drawsLoading || payoutsLoading;

  const staffMap = Object.fromEntries((staff ?? []).map((s) => [s.id, s.fullName ?? s.username ?? 'Staff']));
  const memberMap = Object.fromEntries((members ?? []).map((m) => [m.id, m.fullName ?? m.name ?? 'Member']));
  const chitMap = Object.fromEntries((chits ?? []).map((c) => [c.id, c.name ?? c.id]));

  // Separate batches into collected vs remitted
  const collectedBatches = batches.filter((b) => b.status !== 'VOIDED');
  const remittedBatches = batches.filter((b) => b.remittedAt);
  const voidedBatches = batches.filter((b) => b.status === 'VOIDED');

  const totalCollected = collectedBatches.reduce((s, b) => s + Number(b.totalAmount ?? 0), 0);

  const hasActivity = batches.length > 0 || draws.length > 0 || payouts.length > 0;

  function refetchAll() { refetchBatches(); refetchDraws(); refetchPayouts(); }

  const amt = (v) => hidden ? HIDDEN : fmtAmt(v);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Today's Activity</h3>
          <p className="text-xs text-gray-400 mt-0.5">All transactions, draws, and disbursements from today</p>
        </div>
        <button
          onClick={refetchAll}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading activity…</div>
      ) : !hasActivity ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Clock size={28} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium">No activity yet today</p>
          <p className="text-xs mt-1">Transactions, draws, and payouts will appear here</p>
        </div>
      ) : (
        <div className="p-4 space-y-3">

          {/* ── Payments Collected ── */}
          {collectedBatches.length > 0 && (
            <SectionCard
              icon={Banknote}
              iconColor="text-[#D4A017]"
              iconBg="bg-amber-50"
              title="Payments Collected"
              count={collectedBatches.length}
              subtitle={`Total ${amt(totalCollected)} from ${collectedBatches.length} payment${collectedBatches.length !== 1 ? 's' : ''}`}
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
                  detail={`${n(staffMap, b.remittedBy)} confirmed ${amt(b.totalAmount)} from ${n(staffMap, b.collectedBy)}`}
                  sub={`Member: ${n(memberMap, b.memberId)} · Chit: ${n(chitMap, b.chitId)}`}
                  time={fmtTime(b.remittedAt)}
                />
              ))}
            </SectionCard>
          )}

          {/* ── Voided payments ── */}
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
                  icon={XCircle}
                  iconColor="text-red-500"
                  iconBg="bg-red-50"
                  label="Voided"
                  detail={`${n(staffMap, b.voidedBy)} voided ${amt(b.totalAmount)} from ${n(memberMap, b.memberId)}`}
                  sub={b.voidReason ? `Reason: ${b.voidReason}` : undefined}
                  time={fmtTime(b.voidedAt ?? b.createdAt)}
                />
              ))}
            </SectionCard>
          )}

          {/* ── Draws ── */}
          {draws.length > 0 && (
            <SectionCard
              icon={BookOpen}
              iconColor="text-[#1E3A5F]"
              iconBg="bg-blue-50"
              title="Draw Activity"
              count={draws.length}
              subtitle={`${draws.filter((d) => d.openedAt).length} opened · ${draws.filter((d) => d.closedAt).length} closed · ${draws.filter((d) => d.skippedAt).length} skipped`}
            >
              {draws.map((d) => {
                const chit = n(chitMap, d.chitId);
                const cycle = `${chit} — Cycle #${d.monthNumber}`;
                if (d.skippedAt) return (
                  <EventRow key={`skip-${d.id}`} icon={SkipForward} iconColor="text-orange-500" iconBg="bg-orange-50"
                    label="Skipped" detail={`${n(staffMap, d.skippedBy)} skipped ${cycle}`}
                    sub={d.skipReason} time={fmtTime(d.skippedAt)} />
                );
                if (d.closedAt) return (
                  <EventRow key={`close-${d.id}`} icon={ArrowDownCircle} iconColor="text-gray-600" iconBg="bg-gray-50"
                    label="Closed" detail={`${n(staffMap, d.closedBy)} closed ${cycle}`}
                    sub={`${d.settledCount} settled · ${d.outstandingCount} outstanding`}
                    time={fmtTime(d.closedAt)} />
                );
                if (d.openedAt) return (
                  <EventRow key={`open-${d.id}`} icon={BookOpen} iconColor="text-[#1E3A5F]" iconBg="bg-blue-50"
                    label="Opened" detail={`${n(staffMap, d.openedBy)} opened ${cycle}`}
                    sub={d.dueDate ? `Due: ${d.dueDate}` : undefined}
                    time={fmtTime(d.openedAt)} />
                );
                return null;
              })}
            </SectionCard>
          )}

          {/* ── Payouts ── */}
          {payouts.length > 0 && (
            <SectionCard
              icon={Gift}
              iconColor="text-green-700"
              iconBg="bg-green-50"
              title="Payout Activity"
              count={payouts.length}
              subtitle={`${payouts.filter((p) => p.disbursedAt).length} disbursed · ${payouts.filter((p) => p.status === 'PENDING').length} pending`}
            >
              {payouts.map((p) => {
                const member = n(memberMap, p.memberId);
                const chit = n(chitMap, p.chitId);
                const payAmt = amt(p.netPayoutAmount);

                if (p.disbursedAt) return (
                  <EventRow key={`dis-${p.id}`} icon={Gift} iconColor="text-green-700" iconBg="bg-green-50"
                    label="Disbursed"
                    detail={`${n(staffMap, p.disbursedBy)} disbursed ${payAmt} to ${member}`}
                    sub={`${chit} · Month #${p.monthNumber}${p.disbursementMode ? ` via ${MODE_LABEL[p.disbursementMode] ?? p.disbursementMode}` : ''}${p.referenceNumber ? ` · Ref: ${p.referenceNumber}` : ''}`}
                    time={fmtTime(p.disbursedAt)} />
                );
                if (p.status === 'PENDING' && p.createdAt) return (
                  <EventRow key={`pend-${p.id}`} icon={Clock} iconColor="text-orange-500" iconBg="bg-orange-50"
                    label="Payout Registered"
                    detail={`${n(staffMap, p.createdBy)} registered ${payAmt} payout for ${member}`}
                    sub={`${chit} · Month #${p.monthNumber} — awaiting disbursement`}
                    time={fmtTime(p.createdAt)} />
                );
                if (p.cancelledAt) return (
                  <EventRow key={`can-${p.id}`} icon={Ban} iconColor="text-red-500" iconBg="bg-red-50"
                    label="Cancelled"
                    detail={`${n(staffMap, p.cancelledBy)} cancelled ${payAmt} payout for ${member}`}
                    sub={p.cancellationReason} time={fmtTime(p.cancelledAt)} />
                );
                return null;
              })}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
