import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMembers, getSettlementPreview, confirmSettlement, getMemberSettlements,
  recordSettlementTransaction, getPendingSettlements, getAllSettlements,
  voidSettlement, getSettlementTransactions, getMemberPaymentHistoryByChit,
  getSettlementById,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import FormField, { Select, Textarea } from '../../components/ui/FormField';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import {
  HandCoins, Info, ChevronDown, ChevronUp, CheckSquare, Square,
  TrendingUp, TrendingDown, CheckCircle, History, ChevronRight,
  Printer, BookOpen, AlertTriangle, XCircle, Eye,
} from 'lucide-react';

// ─── Case badge styling ────────────────────────────────────────────────────
const CASE_COLORS = {
  CASE_A:  { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'A' },
  CASE_B1: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'B' },
  CASE_B2: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'B' },
  CASE_C:  { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'C' },
};

function CaseBadge({ settlementCase }) {
  const cfg = CASE_COLORS[settlementCase] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: '?' };
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ─── Payout status pill ────────────────────────────────────────────────────
function PayoutStatusPill({ status }) {
  const cfg = {
    DISBURSED:           { bg: 'bg-green-100',  text: 'text-green-700'  },
    PARTIALLY_DISBURSED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]' },
    PENDING:             { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    CANCELLED:           { bg: 'bg-gray-100',   text: 'text-gray-500'   },
    VOIDED:              { bg: 'bg-gray-100',   text: 'text-gray-500'   },
    NONE:                { bg: 'bg-gray-100',   text: 'text-gray-400'   },
  }[status] ?? { bg: 'bg-gray-100', text: 'text-gray-500' };

  const label = {
    DISBURSED: 'Disbursed', PARTIALLY_DISBURSED: 'Partial',
    PENDING: 'Pending', CANCELLED: 'Cancelled', VOIDED: 'Voided', NONE: 'None',
  }[status] ?? status;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {label}
    </span>
  );
}

// ─── Amount display ────────────────────────────────────────────────────────
function Amt({ value, hidden, showSign = false, className = '' }) {
  if (hidden) return <span className="font-medium text-gray-400 tracking-widest">••••••</span>;
  const n = Number(value ?? 0);
  const formatted = `₹${Math.abs(n).toLocaleString('en-IN')}`;
  const sign = showSign ? (n > 0 ? '+' : n < 0 ? '−' : '') : '';
  return <span className={className}>{sign}{formatted}</span>;
}

// ─── Tooltip (Info icon hover) ─────────────────────────────────────────────
const TIP_W = 320; // matches w-80

function TooltipInfo({ text }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState(null); // { x, y, below, caretLeft }

  return (
    <>
      <span
        className="inline-flex cursor-help"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const vw = window.innerWidth;
          const margin = 10;

          // Ideal centre X — then clamp so the 320 px tooltip stays within the viewport
          const idealX = r.left + r.width / 2;
          const clampedX = Math.min(
            Math.max(idealX, TIP_W / 2 + margin),
            vw - TIP_W / 2 - margin,
          );

          // Where on the tooltip is the caret? (offset from left edge of tooltip)
          const caretLeft = Math.max(16, Math.min(idealX - (clampedX - TIP_W / 2), TIP_W - 16));

          // Show below if there isn't enough room above (rough: 220 px)
          const below = r.top < 220;

          setPos({
            x: clampedX,
            y: below ? r.bottom + 10 : r.top - 10,
            below,
            caretLeft,
          });
          setShow(true);
        }}
        onMouseLeave={() => setShow(false)}
      >
        <Info size={14} className="text-gray-400 hover:text-[#1E3A5F] transition-colors" />
      </span>

      {show && pos && (
        <div
          className="fixed z-[9999] bg-gray-900 text-gray-100 rounded-xl shadow-2xl p-4 pointer-events-none"
          style={{
            width: TIP_W,
            left: pos.x - TIP_W / 2,
            ...(pos.below
              ? { top: pos.y }
              : { top: pos.y, transform: 'translateY(-100%)' }),
          }}
        >
          <pre className="text-xs whitespace-pre-wrap leading-relaxed font-mono">{text}</pre>

          {/* Caret — points toward the icon, flips with tooltip direction */}
          {pos.below ? (
            <div
              className="absolute bottom-full w-0 h-0
                border-l-[6px] border-r-[6px] border-b-[6px]
                border-l-transparent border-r-transparent border-b-gray-900"
              style={{ left: pos.caretLeft - 6 }}
            />
          ) : (
            <div
              className="absolute top-full w-0 h-0
                border-l-[6px] border-r-[6px] border-t-[6px]
                border-l-transparent border-r-transparent border-t-gray-900"
              style={{ left: pos.caretLeft - 6 }}
            />
          )}
        </div>
      )}
    </>
  );
}

// ─── Status pill for payment records ──────────────────────────────────────
const RECORD_STATUS = {
  SETTLED:          { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Settled' },
  PAYOUT_DEDUCTED:  { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]',   label: 'Deducted' },
  WAIVED:           { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Waived' },
  OUTSTANDING:      { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Outstanding' },
  PARTIALLY_PAID:   { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Partial' },
  SETTLEMENT_CLEARED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Cleared' },
};

function RecordStatusPill({ status }) {
  const cfg = RECORD_STATUS[status] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ─── Expandable draws panel ────────────────────────────────────────────────
function DrawsPanel({ records, hidden, colSpan, payoutMonthNumber, netPayoutAmount, disbursedAmount, payoutStatus }) {
  if (!records || records.length === 0) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-6 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-xs text-gray-400 italic">No payment records found for this chit.</p>
        </td>
      </tr>
    );
  }

  const totalDue  = records.reduce((s, r) => s + Number(r.amountDue  ?? 0), 0);
  const totalPaid = records.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
  const totalBal  = records.reduce((s, r) => s + Number(r.balance    ?? 0), 0);
  const fmt = (n) => `₹${Math.abs(Number(n ?? 0)).toLocaleString('en-IN')}`;
  const hasPayoutInfo = payoutMonthNumber != null && payoutStatus && payoutStatus !== 'NONE';

  return (
    <tr>
      <td colSpan={colSpan} className="p-0 border-t border-slate-100">
        <div className="bg-slate-50 px-6 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Draw Payment Records
          </p>
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Draw</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Due Date</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount Due</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Amount Paid</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Balance</th>
                  <th className="px-3 py-2 text-center font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const bal = Number(r.balance ?? 0);
                  const isPayoutDraw = hasPayoutInfo && r.monthNumber === payoutMonthNumber;
                  const isWaived = r.status === 'WAIVED';
                  return (
                    <Fragment key={r.monthNumber}>
                      <tr className={`transition-colors ${isPayoutDraw ? 'bg-[#EEF2F8]/40' : 'hover:bg-slate-50'}`}>
                        <td className="px-3 py-2 font-medium text-gray-700">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>Draw {r.monthNumber}</span>
                            {isPayoutDraw && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EEF2F8] text-[#1E3A5F]">
                                🏆 Payout {hidden ? '••••••' : fmt(netPayoutAmount)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          }) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {hidden ? '••••••' : fmt(r.amountDue)}
                        </td>
                        <td className="px-3 py-2 text-right text-green-700 font-medium">
                          {hidden ? '••••••' : fmt(r.amountPaid)}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${isWaived ? 'text-gray-400' : bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {hidden ? '••••••' : (isWaived || bal === 0) ? '—' : fmt(bal)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <RecordStatusPill status={r.status} />
                        </td>
                      </tr>
                      {isPayoutDraw && (
                        <tr className="bg-[#EEF2F8] border-t border-[#C7D5E8]">
                          <td colSpan={6} className="px-3 py-1.5">
                            <div className="flex items-center gap-3 text-[11px] text-[#1E3A5F]">
                              <span className="font-semibold text-[#1E3A5F]">Payout draw</span>
                              <span>Net payout: <span className="font-medium">{hidden ? '••••••' : fmt(netPayoutAmount)}</span></span>
                              <span>Disbursed: <span className="font-medium">{hidden ? '••••••' : fmt(disbursedAmount)}</span></span>
                              <PayoutStatusPill status={payoutStatus} />
                              {payoutStatus === 'PARTIALLY_DISBURSED' && (
                                <span className="text-amber-700">
                                  Still owed: <span className="font-medium">{hidden ? '••••••' : fmt(Number(netPayoutAmount ?? 0) - Number(disbursedAmount ?? 0))}</span>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold">
                  <td className="px-3 py-2 text-gray-700" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right text-gray-800">
                    {hidden ? '••••••' : fmt(totalDue)}
                  </td>
                  <td className="px-3 py-2 text-right text-green-700">
                    {hidden ? '••••••' : fmt(totalPaid)}
                  </td>
                  <td className={`px-3 py-2 text-right ${totalBal > 0 ? 'text-red-600' : totalBal < 0 ? 'text-green-700' : 'text-gray-400'}`}>
                    {hidden ? '••••••' : totalBal === 0 ? '—' : fmt(totalBal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

const escHtml = (s) => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// ─── Receipt generator ────────────────────────────────────────────────────
function generateReceiptHTML({ txn, memberName, tenantName = '', isCollect, netAmount, remainingAmount }) {
  const fmtAmt = (n) => `₹${Math.abs(Number(n ?? 0)).toLocaleString('en-IN')}`;
  const modeLabel = { CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', UPI: 'UPI' }[txn.mode] ?? txn.mode;
  const dateStr = new Date(txn.recordedAt || txn.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const remaining = Number(remainingAmount ?? 0);
  const isPartial = remaining > 0;
  const logo = `<svg width="110" height="28" viewBox="0 0 110 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" rx="7" fill="#1E3A5F"/><text x="14" y="20" text-anchor="middle" fill="white" font-size="15" font-weight="800" font-family="Arial">C</text><text x="36" y="20" fill="#1E3A5F" font-size="15" font-weight="800" font-family="Arial,sans-serif">ChitWise</text></svg>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Payment Receipt</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111;line-height:1.5;padding:28px 32px;max-width:420px;margin:0 auto}.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1E3A5F;padding-bottom:12px;margin-bottom:20px}.logo-block{display:flex;flex-direction:column;gap:4px}.org{font-size:12px;font-weight:700;color:#1E3A5F}.rt{text-align:right;font-size:9.5px;color:#888;line-height:1.8}.title{font-size:18px;font-weight:800;color:#1E3A5F;margin-bottom:4px}.sub{font-size:11px;color:#888}.amt-box{background:${isCollect ? '#FFF5F5' : '#F0FFF4'};border:2px solid ${isCollect ? '#FCA5A5' : '#86EFAC'};border-radius:10px;padding:18px 20px;margin:16px 0;text-align:center}.amt-label{font-size:11px;font-weight:600;color:${isCollect ? '#DC2626' : '#16A34A'};text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}.amt{font-size:32px;font-weight:800;color:${isCollect ? '#DC2626' : '#16A34A'}}.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F3F4F6;font-size:11px}.row:last-child{border-bottom:none}.rl{color:#6B7280}.rv{font-weight:600;color:#111;text-align:right}.partial-note{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 12px;margin-top:14px;font-size:11px;color:#92400E}.ft{margin-top:20px;padding-top:10px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;font-size:9px;color:#9CA3AF}@media print{body{padding:16px 20px}}</style></head><body><div class="hd"><div class="logo-block">${logo}${tenantName ? `<div class="org">${escHtml(tenantName)}</div>` : ''}</div><div class="rt"><div><b>Payment Receipt</b></div><div>${dateStr}</div></div></div><div class="title">${isCollect ? 'Amount Collected' : 'Amount Disbursed'}</div><div class="sub">Member: <b>${escHtml(memberName)}</b></div><div class="amt-box"><div class="amt-label">${isCollect ? 'Collected from Member' : 'Paid to Member'}</div><div class="amt">${fmtAmt(txn.amount)}</div></div><div class="row"><span class="rl">Payment Mode</span><span class="rv">${modeLabel}</span></div>${txn.referenceNumber ? `<div class="row"><span class="rl">Reference / UTR</span><span class="rv">${escHtml(txn.referenceNumber)}</span></div>` : ''}${txn.notes ? `<div class="row"><span class="rl">Notes</span><span class="rv">${escHtml(txn.notes)}</span></div>` : ''}<div class="row"><span class="rl">Settlement Total</span><span class="rv">${fmtAmt(netAmount)}</span></div>${isPartial ? `<div class="partial-note">⚠ Partial payment — <b>${fmtAmt(remaining)}</b> still ${isCollect ? 'to collect' : 'to disburse'}.</div>` : `<div class="row"><span class="rl">Status</span><span class="rv" style="color:#16A34A;font-weight:700">Fully ${isCollect ? 'Collected' : 'Disbursed'} ✓</span></div>`}<div class="ft"><span>ChitWise — Chitfund Management Platform</span><span>CONFIDENTIAL</span></div></body></html>`;
}

// ─── Print report generator ───────────────────────────────────────────────
function generatePrintHTML({ items, member, totalOwed, totalRefunded, grandTotal, tenantName = '', adjustmentAmount = 0, adjustmentReason = '' }) {
  const fmtAmt = (n) => `₹${Math.abs(Number(n ?? 0)).toLocaleString('en-IN')}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const now = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const caseLabel = { CASE_A: 'Case A — Payout Disbursed', CASE_B1: 'Case B1 — Reserved Slot', CASE_B2: 'Case B2 — No Payout / No Slot', CASE_C: 'Case C — Partial Payout' };
  const payoutLabel = { DISBURSED: 'Disbursed', PARTIALLY_DISBURSED: 'Partially Disbursed', PENDING: 'Pending', NONE: 'None' };
  const recLabel = { SETTLED: 'Settled', OUTSTANDING: 'Outstanding', PARTIALLY_PAID: 'Partial', PAYOUT_DEDUCTED: 'Payout Deducted', WAIVED: 'Waived', SETTLEMENT_CLEARED: 'Cleared' };

  const logo = `<svg width="110" height="28" viewBox="0 0 110 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" rx="7" fill="#1E3A5F"/><text x="14" y="20" text-anchor="middle" fill="white" font-size="15" font-weight="800" font-family="Arial">C</text><text x="36" y="20" fill="#1E3A5F" font-size="15" font-weight="800" font-family="Arial,sans-serif">ChitWise</text></svg>`;

  const chitSections = items.map((item) => {
    const records = item.paymentRecords ?? [];
    const totDue  = records.reduce((s, r) => s + Number(r.amountDue  ?? 0), 0);
    const totPaid = records.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
    const totBal  = records.filter((r) => r.status !== 'WAIVED').reduce((s, r) => s + Number(r.balance ?? 0), 0);
    const net = Number(item.displayNetAmount ?? item.netAmount ?? 0);
    const hasP = item.payoutMonthNumber != null && item.payoutStatus && item.payoutStatus !== 'NONE';

    const payoutLine = hasP ? `<div class="pout"><b>Payout — Draw ${item.payoutMonthNumber}:</b> Net ${fmtAmt(item.netPayoutAmount)} &nbsp;·&nbsp; Disbursed ${fmtAmt(item.disbursedAmount)} &nbsp;·&nbsp; ${payoutLabel[item.payoutStatus] ?? item.payoutStatus}${item.payoutStatus === 'PARTIALLY_DISBURSED' ? ` &nbsp;·&nbsp; Still owed: ${fmtAmt(Number(item.netPayoutAmount ?? 0) - Number(item.disbursedAmount ?? 0))}` : ''}</div>` : '';

    const rows = records.map((r) => {
      const bal = Number(r.balance ?? 0);
      const isPR = hasP && r.monthNumber === item.payoutMonthNumber;
      const isWaived = r.status === 'WAIVED';
      const balCell = isWaived || bal === 0 ? '—' : `<span class="${bal > 0 ? 'owe' : 'crd'}">${fmtAmt(bal)}</span>`;
      const drawLabel = `Draw ${r.monthNumber}${isPR ? ' <span class="ptag">🏆 Payout ' + fmtAmt(item.netPayoutAmount) + '</span>' : ''}`;
      return `<tr${isPR ? ' class="pr"' : ''}><td>${drawLabel}</td><td>${fmtDate(r.dueDate)}</td><td class="r">${fmtAmt(r.amountDue)}</td><td class="r">${fmtAmt(r.amountPaid)}</td><td class="r">${balCell}</td><td class="c">${recLabel[r.status] ?? r.status}</td></tr>`;
    }).join('');

    const table = records.length > 0 ? `<table><thead><tr><th>Draw</th><th>Due Date</th><th class="r">Amount Due</th><th class="r">Amount Paid</th><th class="r">Balance</th><th class="c">Status</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2"><b>Sub-total</b></td><td class="r"><b>${fmtAmt(totDue)}</b></td><td class="r"><b>${fmtAmt(totPaid)}</b></td><td class="r ${totBal > 0 ? 'owe' : totBal < 0 ? 'crd' : ''}"><b>${totBal === 0 ? '—' : fmtAmt(totBal)}</b></td><td></td></tr></tfoot></table>` : `<p class="norec">No payment records on file.</p>`;
    const modeNote = item.settlementCase === 'CASE_C' ? ` · Mode: ${item.displayMode === 'FAIR' ? 'Fair' : 'Admin Win'}` : '';
    const chitStatus = item.chitStatus ? ` · ${item.chitStatus}` : '';
    const netCls = net > 0 ? 'owe' : net < 0 ? 'crd' : '';
    const netLbl = net === 0 ? 'Balanced' : net > 0 ? `Member owes ${fmtAmt(net)}` : `Fund refunds ${fmtAmt(net)}`;

    return `<div class="chit"><div class="ch"><span class="cn">${escHtml(item.chitName)}</span><span class="cm">${chitStatus} · ${caseLabel[item.settlementCase] ?? item.settlementCase}${modeNote}</span></div>${payoutLine}${table}<div class="nl ${netCls}">${netLbl}</div></div>`;
  }).join('');

  const adjustmentAmt = Number(adjustmentAmount ?? 0);
  const gc = grandTotal > 0 ? 'owe' : grandTotal < 0 ? 'crd' : '';
  const gl = grandTotal === 0 ? 'Balanced — no payment needed' : grandTotal > 0 ? `Member pays ${fmtAmt(grandTotal)}` : `Fund refunds ${fmtAmt(grandTotal)}`;
  const adjustmentRow = adjustmentAmt !== 0
    ? `<div class="gr"><span>Adjustment${adjustmentReason ? ` <em style="color:#888;font-weight:400">(${escHtml(adjustmentReason)})</em>` : ''}</span><span class="${adjustmentAmt > 0 ? 'owe' : 'crd'}">${adjustmentAmt > 0 ? '+' : '−'}${fmtAmt(adjustmentAmt)}</span></div>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Settlement Report — ${escHtml(member?.fullName ?? '')}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;line-height:1.5;padding:20px 24px}.rh{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1E3A5F;padding-bottom:12px;margin-bottom:18px}.logo-block{display:flex;flex-direction:column;gap:6px}.org{font-size:13px;font-weight:700;color:#1E3A5F;margin-top:2px}h1{font-size:17px;font-weight:700;color:#1E3A5F;margin-top:10px}.sh{font-size:12px;font-weight:600;color:#374151;margin-top:3px}.mt{font-size:9.5px;color:#666;text-align:right;line-height:1.8}.chit{margin-bottom:18px;border:1px solid #ccd;border-radius:5px;overflow:hidden;page-break-inside:avoid}.ch{background:#EFF4FA;padding:8px 12px;border-bottom:1px solid #ccd}.cn{font-size:12px;font-weight:700;color:#1E3A5F}.cm{font-size:10px;color:#555}.pout{background:#EEF6FF;padding:5px 12px;border-bottom:1px solid #BDD7EE;font-size:10px;color:#1a4a7a}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#f4f6fa;padding:5px 10px;text-align:left;font-weight:600;color:#444;border-bottom:1px solid #ccd}td{padding:4px 10px;border-bottom:1px solid #eef;color:#333}tfoot td{background:#f4f6fa;border-top:2px solid #bbc;padding:5px 10px}.r{text-align:right}.c{text-align:center}.owe{color:#c0392b}.crd{color:#1a9150}tr.pr{background:#EEF6FF}.ptag{display:inline-block;background:#DBEAFE;color:#1d4ed8;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;margin-left:4px}.mn{color:#999;font-size:9px}.norec{padding:8px 12px;font-size:10px;color:#aaa;font-style:italic}.nl{padding:7px 12px;font-size:11px;font-weight:600;border-top:1px solid #ccd}.nl.owe{background:#fff5f5;color:#c0392b}.nl.crd{background:#f0fff4;color:#1a9150}.nl:not(.owe):not(.crd){background:#f9f9f9;color:#555}.gt{margin-top:16px;border:2px solid #1E3A5F;border-radius:5px;padding:14px 16px;page-break-inside:avoid}.gt h2{font-size:12px;font-weight:700;color:#1E3A5F;padding-bottom:8px;border-bottom:1px solid #ccd;margin-bottom:8px}.gr{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}.gf{display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:8px 0 0;border-top:2px solid #1E3A5F;margin-top:6px}.ft{margin-top:16px;padding-top:8px;border-top:1px solid #dde;display:flex;justify-content:space-between;font-size:9px;color:#aaa}@media print{body{padding:12px 16px}.chit{page-break-inside:avoid}}</style></head><body><div class="rh"><div class="logo-block">${logo}${tenantName ? `<div class="org">${escHtml(tenantName)}</div>` : ''}<h1>Settlement Report</h1><div class="sh">Member: <strong>${escHtml(member?.fullName ?? 'Unknown Member')}</strong></div></div><div class="mt"><div>Generated: ${now}</div><div>Chits included: ${items.length}</div></div></div>${chitSections}<div class="gt"><h2>Grand Total — All ${items.length} Chit${items.length !== 1 ? 's' : ''}</h2><div class="gr"><span>Member owes (sum)</span><span class="owe">${fmtAmt(totalOwed)}</span></div><div class="gr"><span>Fund refunds (sum)</span><span class="crd">${fmtAmt(totalRefunded)}</span></div>${adjustmentRow}<div class="gf"><span>Net Settlement</span><span class="${gc}">${gl}</span></div></div><div class="ft"><span>ChitWise — Chitfund Management Platform</span><span>CONFIDENTIAL — Internal use only</span></div></body></html>`;
}

// ─── Case A/B/C guide modal ───────────────────────────────────────────────
const CASE_DEFS = [
  {
    label: 'A',
    badgeBg: 'bg-[#1E3A5F]',
    headerBg: 'bg-[#EEF2F8]',
    borderColor: 'border-[#C7D5E8]',
    accentText: 'text-[#1E3A5F]',
    title: 'Payout Fully Disbursed',
    icon: '✓',
    iconBg: 'bg-[#EEF2F8] text-[#1E3A5F]',
    when: 'Member already received a full payout for at least one slot. They still owe remaining installments for those slots.',
    formula: 'Member owes = Unpaid past dues + Future installments (per processed slot)',
    steps: [
      { label: 'Unpaid past dues', desc: 'Missed payments from past months' },
      { label: 'Future installments', desc: 'Remaining months × postPayoutRate × number of processed slots' },
      { label: 'Reserved slot credit', desc: 'If member also has a RESERVED slot, their proportional paid-in amount is credited back' },
    ],
    example: {
      setup: '12-month chit, ₹10,000/month. Won Draw 4, received payout. Settling at month 7.',
      calc: [
        ['Unpaid months (missed)', '₹20,000 owed'],
        ['Future months 8–12 (5 months)', '₹50,000 owed'],
        ['Reserved slot credit (if any)', '−proportional amount'],
      ],
      result: { label: 'Member owes', amount: '₹70,000', color: 'text-red-600' },
    },
  },
  {
    label: 'B1',
    badgeBg: 'bg-amber-500',
    headerBg: 'bg-amber-50',
    borderColor: 'border-amber-200',
    accentText: 'text-amber-700',
    title: 'No Payout — Reserved Slot',
    icon: '◎',
    iconBg: 'bg-amber-100 text-amber-700',
    when: 'Member has a reserved slot but never received a payout. Exiting mid-chit.',
    formula: 'Fund refunds = Total paid in by member (for that slot)',
    steps: [
      { label: 'Total paid in', desc: 'Exact amount the member contributed — no estimate, no draws×rate formula' },
      { label: 'Future installments', desc: 'Waived — the reserved slot is voided on settlement' },
      { label: 'Multi-slot', desc: 'If member had multiple slots with different statuses, only the reserved portion is refunded proportionally' },
    ],
    example: {
      setup: '10-month chit, ₹10,000/month. Reserved slot in Draw 8. Member paid 5 months = ₹50,000.',
      calc: [
        ['Paid by member', '₹50,000'],
        ['Fund refunds', '₹50,000'],
        ['Future installments', 'Waived'],
      ],
      result: { label: 'Fund refunds', amount: '₹50,000', color: 'text-green-700' },
    },
  },
  {
    label: 'B2',
    badgeBg: 'bg-amber-500',
    headerBg: 'bg-amber-50',
    borderColor: 'border-amber-200',
    accentText: 'text-amber-700',
    title: 'No Payout — No Slot',
    icon: '○',
    iconBg: 'bg-amber-100 text-amber-700',
    when: 'Member never won and has no reserved slot. Exiting mid-chit.',
    formula: 'Fund refunds = Total paid in by member',
    steps: [
      { label: 'Total paid in', desc: 'Full amount member actually paid — refunded as-is' },
      { label: 'Future installments', desc: 'Fully waived — member is exiting the chit' },
      { label: 'Adjustment', desc: 'Admin can deduct unpaid dues or add charges via the adjustment field' },
    ],
    example: {
      setup: '10-month chit, ₹10,000/month. Member paid months 1–3 = ₹30,000.',
      calc: [
        ['Paid by member', '₹30,000'],
        ['Fund refunds', '₹30,000'],
        ['Future (months 4–10)', 'Waived'],
      ],
      result: { label: 'Fund refunds', amount: '₹30,000', color: 'text-green-700' },
    },
  },
  {
    label: 'C',
    badgeBg: 'bg-[#1E3A5F]',
    headerBg: 'bg-[#EEF2F8]',
    borderColor: 'border-[#C7D5E8]',
    accentText: 'text-[#1E3A5F]',
    title: 'Partial Payout — Admin Chooses Mode',
    icon: '◑',
    iconBg: 'bg-[#EEF2F8] text-[#1E3A5F]',
    when: 'Member won but only part of the payout was disbursed. Admin picks how to handle the remainder.',
    formula: null,
    steps: null,
    modes: [
      {
        name: 'FAIR',
        desc: 'Fund still owes the remaining payout. That amount is offset against the member\'s dues.',
        formula: 'Net = Unpaid dues − Still owed by fund',
      },
      {
        name: 'Admin Win',
        desc: 'Remaining payout is forgiven. Member just settles unpaid dues normally.',
        formula: 'Net = Unpaid dues (remainder forfeited)',
      },
    ],
    example: {
      setup: 'Net payout ₹1,00,000. Only ₹40,000 disbursed. Still owed = ₹60,000. Unpaid dues = ₹30,000.',
      calc: null,
      modes: [
        { name: 'FAIR', result: '₹30,000 − ₹60,000 = Fund refunds ₹30,000', color: 'text-green-700' },
        { name: 'Admin Win', result: '₹30,000 = Member owes ₹30,000', color: 'text-red-600' },
      ],
    },
  },
];

function CaseGuideModal({ onClose }) {
  const [active, setActive] = useState('A');
  const c = CASE_DEFS.find((d) => d.label === active);

  return (
    <Modal title="Settlement Case Reference" onClose={onClose} size="lg">
      <div className="pb-2">
        {/* Intro */}
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          Each chit is classified into a case based on payout status. The case determines the settlement formula.
        </p>

        {/* Case selector tabs */}
        <div className="flex gap-2 mb-6">
          {CASE_DEFS.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setActive(d.label)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all cursor-pointer ${
                active === d.label
                  ? `${d.borderColor} ${d.headerBg}`
                  : 'border-gray-100 hover:border-gray-200 bg-gray-50'
              }`}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${d.badgeBg}`}>
                {d.label}
              </span>
              <span className={`text-xs font-semibold leading-tight text-center ${active === d.label ? d.accentText : 'text-gray-500'}`}>
                {d.label === 'A' ? 'Full payout' : d.label === 'B1' ? 'Reserved' : d.label === 'B2' ? 'No slot' : 'Partial'}
              </span>
            </button>
          ))}
        </div>

        {/* Active case detail */}
        <div className={`rounded-2xl border-2 ${c.borderColor} overflow-hidden`}>
          {/* Header */}
          <div className={`${c.headerBg} px-6 py-4 border-b ${c.borderColor}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${c.iconBg}`}>
                {c.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${c.badgeBg}`}>Case {c.label}</span>
                  <h3 className={`text-base font-bold ${c.accentText}`}>{c.title}</h3>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{c.when}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 bg-white space-y-5">
            {/* Formula */}
            {c.formula && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Formula</p>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <code className={`text-sm font-semibold ${c.accentText}`}>{c.formula}</code>
                </div>
              </div>
            )}

            {/* Mode breakdown for Case C */}
            {c.modes && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Two Modes</p>
                <div className="grid grid-cols-2 gap-3">
                  {c.modes.map((m) => (
                    <div key={m.name} className={`rounded-xl border-2 ${c.borderColor} p-4`}>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.iconBg} ${c.accentText}`}>{m.name}</span>
                      <p className="text-xs text-gray-600 mt-2 mb-2 leading-relaxed">{m.desc}</p>
                      <code className={`text-xs font-semibold ${c.accentText} block`}>{m.formula}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* What each component means */}
            {c.steps && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Components</p>
                <div className="space-y-2">
                  {c.steps.map((s) => (
                    <div key={s.label} className="flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${c.badgeBg}`} />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Example */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Example</p>
              <div className={`rounded-xl border ${c.borderColor} overflow-hidden`}>
                <div className={`${c.headerBg} px-4 py-2.5 border-b ${c.borderColor}`}>
                  <p className="text-xs text-gray-600">{c.example.setup}</p>
                </div>
                {c.example.calc && (
                  <div className="divide-y divide-gray-100">
                    {c.example.calc.map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center px-4 py-2.5 bg-white">
                        <span className="text-xs text-gray-600">{k}</span>
                        <span className="text-xs font-semibold text-gray-800">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {c.example.modes && (
                  <div className="divide-y divide-gray-100">
                    {c.example.modes.map((m) => (
                      <div key={m.name} className="flex justify-between items-center px-4 py-2.5 bg-white">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${c.iconBg} ${c.accentText}`}>{m.name}</span>
                        <span className={`text-xs font-semibold ${m.color}`}>{m.result}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className={`px-4 py-3 ${c.headerBg} border-t ${c.borderColor} flex justify-between items-center`}>
                  {c.example.result ? (
                    <>
                      <span className="text-xs font-bold text-gray-700">{c.example.result.label}</span>
                      <span className={`text-base font-bold ${c.example.result.color}`}>{c.example.result.amount}</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-500 italic">Result depends on admin's mode choice above</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main SettlementTab ────────────────────────────────────────────────────
export default function SettlementTab({ initialMemberId = '', initialSettlementId = '', initialPaymentId = '' }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const { hidden } = useHiddenAmounts();
  const { tenantName } = useAuth();

  const [selectedMemberId, setSelectedMemberId] = useState(initialMemberId);
  const [highlightPaymentId, setHighlightPaymentId] = useState(initialPaymentId || null);
  const [toggledChits, setToggledChits] = useState({}); // chitId → true/false
  const [modes, setModes] = useState({});               // chitId → 'FAIR' | 'ADMIN_WIN'
  const [expandedChits, setExpandedChits] = useState({}); // chitId → true/false
  const [notes, setNotes] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyPage, setHistoryPage] = useState(0);
  const [showCaseGuide, setShowCaseGuide] = useState(false);
  const [pendingPage, setPendingPage] = useState(0);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [allHistPage, setAllHistPage] = useState(0);
  const [viewSettlement, setViewSettlement] = useState(null); // settlement object to show in detail modal
  const [voidConfirmId, setVoidConfirmId] = useState(null);
  const [expandedDrawChit, setExpandedDrawChit] = useState(null); // chitId inside detail modal

  // Payment recording step (shown after settlement is confirmed)
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [confirmedSettlement, setConfirmedSettlement] = useState(null); // settlement response
  const [paymentMethod, setPaymentMethod] = useState(''); // CASH | BANK_TRANSFER | UPI
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isNewConfirmation, setIsNewConfirmation] = useState(false);
  const [recordedTxn, setRecordedTxn] = useState(null); // holds response after successful payment
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [confirmedRemaining, setConfirmedRemaining] = useState(0);

  // ── Data queries ───────────────────────────────────────────────────────
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
  });
  const activeMembers = allMembers.filter((m) => m.status === 'ACTIVE' || !m.status);
  const selectedMember = allMembers.find((m) => m.id === selectedMemberId) ?? null;

  // Preview: triggered whenever member selection changes
  const {
    data: preview,
    isLoading: previewLoading,
    isError: previewError,
    error: previewErrorObj,
  } = useQuery({
    queryKey: ['settlement-preview', selectedMemberId],
    queryFn: () => getSettlementPreview({
      memberId: selectedMemberId,
      chitIds: null, // fetch all chits
    }),
    enabled: !!selectedMemberId,

    retry: 1,       // fail fast — errors usually aren't transient here
  });

  // Auto-toggle all chits on when preview data arrives (React Query v5: no onSuccess in useQuery)
  useEffect(() => {
    if (!preview?.chitItems) return;
    const allOn = {};
    const defaultModes = {};
    preview.chitItems.forEach((item) => {
      allOn[item.chitId] = true;
      defaultModes[item.chitId] = 'FAIR';
    });
    setToggledChits(allOn);
    setModes(defaultModes);
  }, [preview]);

  // Auto-open a specific settlement when navigating from treasury (one-shot)
  const autoOpenedRef = useRef(false);
  const { data: linkedSettlement } = useQuery({
    queryKey: ['settlement-by-id', initialSettlementId],
    queryFn: () => getSettlementById(initialSettlementId),
    enabled: !!initialSettlementId && !autoOpenedRef.current,
  });
  useEffect(() => {
    if (linkedSettlement && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setViewSettlement(linkedSettlement);
      setShowHistoryView(true);
      if (initialPaymentId) setHighlightPaymentId(initialPaymentId);
    }
  }, [linkedSettlement]);

  // Settlement history for selected member — paginated
  const { data: historyPage_data, isLoading: historyLoading } = useQuery({
    queryKey: ['settlement-history', selectedMemberId, historyPage],
    queryFn: () => getMemberSettlements(selectedMemberId, historyPage, 10),
    enabled: !!selectedMemberId,
    keepPreviousData: true,
  });
  const history = historyPage_data?.content ?? [];
  const historyTotalPages = historyPage_data?.totalPages ?? 0;
  const historyTotalElements = historyPage_data?.totalElements ?? 0;

  // Settlements awaiting payment (all, cross-member)
  const { data: pendingPage_data, isLoading: pendingLoading } = useQuery({
    queryKey: ['settlement-pending-payments', pendingPage],
    queryFn: () => getPendingSettlements(pendingPage, 20),
    keepPreviousData: true,
  });
  const pendingSettlements = pendingPage_data?.content ?? [];
  const pendingTotalPages = pendingPage_data?.totalPages ?? 0;
  const pendingTotalElements = pendingPage_data?.totalElements ?? 0;

  // All settlements across all members — for the History section
  const { data: allHistPage_data, isLoading: allHistLoading } = useQuery({
    queryKey: ['settlement-all', allHistPage],
    queryFn: () => getAllSettlements(allHistPage, 20),
    enabled: showHistoryView,
    keepPreviousData: true,
  });
  const allSettlements = allHistPage_data?.content ?? [];
  const allHistTotalPages = allHistPage_data?.totalPages ?? 0;
  const allHistTotalElements = allHistPage_data?.totalElements ?? 0;

  // Draw-level payment details for the selected chit in the detail modal
  const { data: drawDetails = [], isLoading: drawLoading } = useQuery({
    queryKey: ['settlement-draw-details', viewSettlement?.memberId, expandedDrawChit],
    queryFn: () => getMemberPaymentHistoryByChit(viewSettlement.memberId, expandedDrawChit),
    enabled: !!(viewSettlement?.memberId && expandedDrawChit),
  });

  // Payment transactions for the selected settlement (partial payment history)
  const { data: settlementTxns = [] } = useQuery({
    queryKey: ['settlement-transactions', viewSettlement?.id],
    queryFn: () => getSettlementTransactions(viewSettlement.id),
    enabled: !!viewSettlement?.id,
  });

  const voidMutation = useMutation({
    mutationFn: (settlementId) => voidSettlement(settlementId),
    onSuccess: () => {
      toast.success('Settlement voided — payment records reverted to Outstanding');
      qc.invalidateQueries({ queryKey: ['settlement-all'] });
      qc.invalidateQueries({ queryKey: ['settlement-pending-payments'] });
      qc.invalidateQueries({ queryKey: ['settlement-history'] });
      qc.invalidateQueries({ queryKey: ['members'] });
      setVoidConfirmId(null);
      setViewSettlement(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to void settlement'),
  });

  // ── Derived calculation (respecting toggles + mode overrides) ─────────
  const chitItems = preview?.chitItems ?? [];

  // Re-compute net amounts client-side when admin toggles mode (for CASE_C)
  // The backend already returns both mode amounts; we just pick the right one.
  const computedItems = useMemo(() => {
    return chitItems.map((item) => {
      const currentMode = modes[item.chitId] ?? 'FAIR';
      let netAmount = item.netAmount;
      // For CASE_C, if mode differs from what backend returned, swap to alternative
      if (item.settlementCase === 'CASE_C') {
        const backendMode = item.currentMode ?? 'FAIR';
        if (currentMode !== backendMode && item.alternativeModeAmount !== null) {
          netAmount = item.alternativeModeAmount;
        }
      }
      return { ...item, displayNetAmount: netAmount, displayMode: currentMode };
    });
  }, [chitItems, modes]);

  const includedItems = computedItems.filter((i) => toggledChits[i.chitId]);

  const totalOwed = includedItems
    .filter((i) => Number(i.displayNetAmount) > 0)
    .reduce((s, i) => s + Number(i.displayNetAmount), 0);

  const totalRefunded = includedItems
    .filter((i) => Number(i.displayNetAmount) < 0)
    .reduce((s, i) => s + Math.abs(Number(i.displayNetAmount)), 0);

  const grandTotal = totalOwed - totalRefunded;
  const parsedAdjustment = adjustmentAmount !== '' ? Number(adjustmentAmount) : 0;
  const adjustedTotal = grandTotal + parsedAdjustment;

  // ── Confirm mutation ───────────────────────────────────────────────────
  const confirmMutation = useMutation({
    mutationFn: () => {
      const chitItemsPayload = includedItems.map((item) => ({
        chitId: item.chitId,
        mode: item.settlementCase === 'CASE_C' ? (modes[item.chitId] ?? 'FAIR') : null,
      }));
      return confirmSettlement({
        memberId: selectedMemberId,
        chitItems: chitItemsPayload,
        notes: notes || null,
        adjustmentAmount: parsedAdjustment !== 0 ? parsedAdjustment : null,
        adjustmentReason: parsedAdjustment !== 0 ? (adjustmentReason || null) : null,
      });
    },
    onSuccess: (settlement) => {
      qc.invalidateQueries({ queryKey: ['settlement-preview', selectedMemberId] });
      qc.invalidateQueries({ queryKey: ['settlement-history', selectedMemberId] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      qc.invalidateQueries({ queryKey: ['members'] });
      setShowConfirm(false);
      setToggledChits({});
      setModes({});
      setNotes('');
      setAdjustmentAmount('');
      setAdjustmentReason('');
      // If there's a payment to collect/disburse, show payment step
      const net = Number(settlement?.netAmount ?? 0);
      if (net !== 0 && settlement?.id) {
        setConfirmedSettlement(settlement);
        setPaymentMethod('');
        setPaymentAmount(String(Math.abs(net)));
        setConfirmedRemaining(Math.abs(net));
        setPaymentReference('');
        setPaymentNotes('');
        setRecordedTxn(null);
        setIsNewConfirmation(true);
        setShowPaymentStep(true);
      } else {
        toast.success('Settlement confirmed — member marked as Inactive. Accounts balanced.');
        setSelectedMemberId('');
      }
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Settlement failed'),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: () => {
      const net = Number(confirmedSettlement?.netAmount ?? 0);
      const absNet = Math.abs(net);
      const enteredAmt = parseFloat(paymentAmount);
      const amount = !isNaN(enteredAmt) && enteredAmt > 0 ? enteredAmt : absNet;
      return recordSettlementTransaction({
        settlementId: confirmedSettlement.id,
        amount,
        mode: paymentMethod,
        referenceNumber: paymentReference || undefined,
        notes: paymentNotes || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      qc.invalidateQueries({ queryKey: ['settlement-pending-payments'] });
      qc.invalidateQueries({ queryKey: ['settlement-history'] });
      qc.invalidateQueries({ queryKey: ['settlement-transactions', confirmedSettlement?.id] });
      setRecordedTxn(data);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to record payment'),
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  const toggleChit = useCallback((chitId) => {
    setToggledChits((prev) => ({ ...prev, [chitId]: !prev[chitId] }));
  }, []);

  const toggleExpand = useCallback((chitId) => {
    setExpandedChits((prev) => ({ ...prev, [chitId]: !prev[chitId] }));
  }, []);

  const toggleMode = useCallback((chitId) => {
    setModes((prev) => ({
      ...prev,
      [chitId]: prev[chitId] === 'ADMIN_WIN' ? 'FAIR' : 'ADMIN_WIN',
    }));
  }, []);

  const fmtAmt = (n) => `₹${Math.abs(Number(n ?? 0)).toLocaleString('en-IN')}`;

  const handlePrint = useCallback(() => {
    const html = generatePrintHTML({
      items: includedItems,
      member: selectedMember,
      totalOwed,
      totalRefunded,
      grandTotal,
      tenantName,
      adjustmentAmount: Number(adjustmentAmount || 0),
      adjustmentReason,
    });
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [includedItems, selectedMember, totalOwed, totalRefunded, grandTotal, adjustmentAmount, adjustmentReason]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        {showHistoryView ? (
          <>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowHistoryView(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight size={18} className="text-gray-500 rotate-180" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
                  Settlement History
                </h2>
                <p className="text-sm text-gray-500">All settlements across all members</p>
              </div>
            </div>
            {allHistTotalElements > 0 && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-[#EEF2F8] text-[#1E3A5F] border border-[#C7D5E8]">
                {allHistTotalElements} total
              </span>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF4FA' }}>
                <HandCoins size={20} style={{ color: '#1E3A5F' }} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
                  Member Settlement
                </h2>
                <p className="text-sm text-gray-500">Calculate and finalize a member's exit settlement across all chits</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setShowHistoryView(true); setAllHistPage(0); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <History size={15} />
              Settlement History
            </button>
          </>
        )}
      </div>

      {/* ── Settlement History view ──────────────────────────────────────── */}
      {showHistoryView && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {allHistLoading ? (
            <div className="p-10"><PageSpinner /></div>
          ) : allSettlements.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <History size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400">No settlements recorded yet</p>
            </div>
          ) : (
            <>
              <Table columns={['Member', 'Date', 'Net Amount', 'Direction', 'Status', 'Remaining', '']}>
                {allSettlements.map((s) => {
                  const net = Number(s.netAmount);
                  const absNet = Math.abs(net);
                  const isCollect = net > 0;
                  const moved = isCollect ? Number(s.collectedAmount ?? 0) : Number(s.disbursedAmount ?? 0);
                  const remaining = Math.max(0, absNet - moved);
                  const memberName = allMembers.find((m) => m.id === s.memberId)?.fullName ?? `…${String(s.memberId).slice(-6)}`;
                  const isVoided = s.paymentStatus === 'VOIDED';
                  const statusCfg = {
                    PENDING:             { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Pending' },
                    PARTIALLY_COLLECTED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Partial' },
                    PARTIALLY_DISBURSED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Partial' },
                    FULLY_COLLECTED:     { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Collected' },
                    FULLY_DISBURSED:     { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Disbursed' },
                    BALANCED:            { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Balanced' },
                    VOIDED:              { bg: 'bg-red-100',    text: 'text-red-600',    label: 'Voided' },
                  }[s.paymentStatus] ?? { bg: 'bg-gray-100', text: 'text-gray-400', label: s.paymentStatus };
                  return (
                    <Tr key={s.id} className={isVoided ? 'opacity-60' : ''}>
                      <Td className="font-medium text-gray-800">{memberName}</Td>
                      <Td className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(s.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Td>
                      <Td className={`font-semibold ${isCollect ? 'text-red-600' : 'text-green-700'}`}>
                        {hidden ? '••••••' : `₹${absNet.toLocaleString('en-IN')}`}
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isCollect ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          {isCollect ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {isCollect ? 'Collect' : 'Pay out'}
                        </span>
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                          {statusCfg.label}
                        </span>
                      </Td>
                      <Td className={`font-semibold text-sm ${remaining > 0 && !isVoided ? (isCollect ? 'text-red-600' : 'text-green-700') : 'text-gray-400'}`}>
                        {isVoided ? '—' : (hidden ? '••••••' : `₹${remaining.toLocaleString('en-IN')}`)}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setViewSettlement(s); setExpandedDrawChit(null); }}
                            className="text-xs font-medium text-[#1E3A5F] hover:underline flex items-center gap-1"
                          >
                            <Eye size={13} /> View
                          </button>
                          {!isVoided && (
                            <button
                              type="button"
                              onClick={() => setVoidConfirmId(s.id)}
                              className="text-xs font-medium text-red-600 hover:underline flex items-center gap-1"
                            >
                              <XCircle size={13} /> Void
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Table>
              {allHistTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={allHistPage === 0}
                    onClick={() => setAllHistPage((p) => p - 1)}
                    className="text-xs font-medium text-gray-600 disabled:opacity-40 hover:text-[#1E3A5F]"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-gray-400">Page {allHistPage + 1} of {allHistTotalPages}</span>
                  <button
                    type="button"
                    disabled={allHistPage >= allHistTotalPages - 1}
                    onClick={() => setAllHistPage((p) => p + 1)}
                    className="text-xs font-medium text-gray-600 disabled:opacity-40 hover:text-[#1E3A5F]"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Main content — hidden when history view is open ──────────────── */}
      {!showHistoryView && <>

      {/* ── Awaiting Settlement Payment ──────────────────────────────── */}
      {(pendingSettlements.length > 0 || pendingLoading) && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 flex items-center justify-between bg-amber-50">
            <div className="flex items-center gap-2">
              <HandCoins size={16} className="text-amber-600" />
              <span className="font-semibold text-amber-800">Awaiting Settlement Payment</span>
              {pendingTotalElements > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-200 text-amber-800">
                  {pendingTotalElements}
                </span>
              )}
            </div>
            <span className="text-xs text-amber-600">Settlements confirmed but payment not yet fully recorded</span>
          </div>

          {pendingLoading ? (
            <div className="p-6"><PageSpinner /></div>
          ) : (
            <>
              <Table columns={['Member', 'Settled On', 'Net Amount', 'Direction', 'Remaining', 'Status', '']}>
                {pendingSettlements.map((s) => {
                  const net = Number(s.netAmount);
                  const absNet = Math.abs(net);
                  const moved = net > 0 ? Number(s.collectedAmount ?? 0) : Number(s.disbursedAmount ?? 0);
                  const remaining = Math.max(0, absNet - moved);
                  const isCollect = net > 0;
                  const memberName = allMembers.find((m) => m.id === s.memberId)?.fullName ?? `…${String(s.memberId).slice(-6)}`;
                  const statusCfg = {
                    PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Not started' },
                    PARTIALLY_COLLECTED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Partial' },
                    PARTIALLY_DISBURSED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Partial' },
                  }[s.paymentStatus] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: s.paymentStatus };

                  return (
                    <Tr key={s.id} onClick={() => { setViewSettlement(s); setExpandedDrawChit(null); }}>
                      <Td className="font-medium text-gray-800">{memberName}</Td>
                      <Td className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(s.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Td>
                      <Td className={`font-semibold ${isCollect ? 'text-red-600' : 'text-green-700'}`}>
                        {hidden ? '••••••' : `₹${absNet.toLocaleString('en-IN')}`}
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isCollect ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          {isCollect ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {isCollect ? 'Collect from member' : 'Pay to member'}
                        </span>
                      </Td>
                      <Td className={`font-semibold ${remaining > 0 ? (isCollect ? 'text-red-600' : 'text-green-700') : 'text-gray-400'}`}>
                        {hidden ? '••••••' : `₹${remaining.toLocaleString('en-IN')}`}
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
                          {statusCfg.label}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-xs font-medium text-[#1E3A5F] flex items-center gap-1">
                          <Eye size={13} /> View
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </Table>

              {/* Pagination */}
              {pendingTotalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-amber-100 bg-amber-50/50">
                  <span className="text-xs text-gray-500">
                    Page {pendingPage + 1} of {pendingTotalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="muted" disabled={pendingPage === 0} onClick={() => setPendingPage((p) => p - 1)}>
                      ← Prev
                    </Button>
                    <Button size="sm" variant="muted" disabled={pendingPage >= pendingTotalPages - 1} onClick={() => setPendingPage((p) => p + 1)}>
                      Next →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 1: Member selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Member</h3>
        <div className="max-w-sm">
          <FormField label="Member">
            <Select
              value={selectedMemberId}
              onChange={(e) => {
                setSelectedMemberId(e.target.value);
                setToggledChits({});
                setModes({});
                setExpandedChits({});
                setAdjustmentAmount('');
                setAdjustmentReason('');
                setNotes('');
                setHistoryPage(0);
              }}
            >
              <option value="">— Choose a member —</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </Select>
          </FormField>
        </div>
        {selectedMember && (
          <p className="text-xs text-gray-400 mt-2">
            Member ID: <span className="font-mono">{selectedMemberId.slice(0, 8)}…</span>
          </p>
        )}
      </div>

      {/* Step 2: Settlement table */}
      {selectedMemberId && (
        <>
          {previewLoading ? (
            <PageSpinner />
          ) : previewError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <p className="font-medium">Failed to load settlement preview.</p>
              {previewErrorObj?.response?.data?.message && (
                <p className="mt-1 text-xs opacity-80">{previewErrorObj.response.data.message}</p>
              )}
              {previewErrorObj?.response?.status && (
                <p className="mt-0.5 text-xs opacity-60">HTTP {previewErrorObj.response.status}</p>
              )}
            </div>
          ) : chitItems.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              title="No chit enrollments found"
              message="This member has no chit enrollment records to settle."
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Settlement Breakdown</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Toggle chits to include/exclude. For partial payouts (Case C), choose Fair or Admin Win mode.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCaseGuide(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border-2 border-[#1E3A5F]/20 text-[#1E3A5F] hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/5 transition-all cursor-pointer bg-white"
                    title="What are Cases A, B, C?"
                  >
                    <BookOpen size={15} />
                    Case Guide
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={includedItems.length === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border-2 border-[#D4A017]/40 text-[#8B6914] hover:border-[#D4A017] hover:bg-[#D4A017]/10 transition-all cursor-pointer bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Print settlement report"
                  >
                    <Printer size={15} />
                    Print Report
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-10"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Chit</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Case</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Payout</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unpaid Dues</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Future Installs</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Amount</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedItems.map((item) => {
                      const included = !!toggledChits[item.chitId];
                      const expanded = !!expandedChits[item.chitId];
                      const net = Number(item.displayNetAmount ?? 0);
                      const isOwes = net > 0;
                      const isZero = net === 0;
                      const hasRecords = item.paymentRecords && item.paymentRecords.length > 0;

                      return (
                        <Fragment key={item.chitId}>
                          <tr
                            className={`border-b border-gray-100 transition-colors ${included ? 'bg-white' : 'bg-gray-50 opacity-60'} ${hasRecords ? 'cursor-pointer hover:bg-[#EEF2F8]/30' : ''}`}
                            onClick={hasRecords ? () => toggleExpand(item.chitId) : undefined}
                          >
                            {/* Include toggle — stop propagation so clicking checkbox doesn't expand */}
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => toggleChit(item.chitId)}
                                className="p-1 rounded cursor-pointer text-gray-400 hover:text-[#1E3A5F] transition-colors"
                                title={included ? 'Exclude this chit' : 'Include this chit'}
                              >
                                {included ? (
                                  <CheckSquare size={18} style={{ color: '#1E3A5F' }} />
                                ) : (
                                  <Square size={18} />
                                )}
                              </button>
                            </td>

                            {/* Chit name — with expand chevron */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {hasRecords ? (
                                  <ChevronRight
                                    size={14}
                                    className={`text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
                                  />
                                ) : (
                                  <span className="w-3.5" />
                                )}
                                <div>
                                  <p className="font-medium text-gray-800">{item.chitName}</p>
                                  <p className="text-xs text-gray-400">
                                    {item.chitStatus}
                                    {hasRecords && (
                                      <span className="ml-1.5 text-[#1E3A5F]/60">
                                        · {item.paymentRecords.length} draws
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Case badge */}
                            <td className="px-4 py-3 text-center">
                              <CaseBadge settlementCase={item.settlementCase} />
                            </td>

                            {/* Payout status */}
                            <td className="px-4 py-3">
                              <PayoutStatusPill status={item.payoutStatus} />
                            </td>

                            {/* Unpaid dues */}
                            <td className="px-4 py-3 text-right">
                              {hidden ? (
                                <span className="text-gray-400 tracking-widest">••••••</span>
                              ) : (
                                <span className={Number(item.unpaidDues) > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                                  {fmtAmt(item.unpaidDues)}
                                </span>
                              )}
                            </td>

                            {/* Future installments */}
                            <td className="px-4 py-3 text-right">
                              {hidden ? (
                                <span className="text-gray-400 tracking-widest">••••••</span>
                              ) : (
                                <span className="text-gray-700">{fmtAmt(item.futureInstallments)}</span>
                              )}
                            </td>

                            {/* Mode toggle (CASE_C only) — stop propagation */}
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {item.settlementCase === 'CASE_C' ? (
                                <button
                                  type="button"
                                  onClick={() => toggleMode(item.chitId)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                                    item.displayMode === 'FAIR'
                                      ? 'bg-[#EEF2F8] text-[#1E3A5F] border-[#C7D5E8] hover:bg-[#EEF2F8]'
                                      : 'bg-[#EEF2F8]/60 text-[#1E3A5F] border-[#C7D5E8] hover:bg-[#EEF2F8]'
                                  }`}
                                >
                                  {item.displayMode === 'FAIR' ? 'Fair' : 'Admin Win'}
                                </button>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>

                            {/* Net amount */}
                            <td className="px-4 py-3 text-right">
                              {hidden ? (
                                <span className="text-gray-400 tracking-widest">••••••</span>
                              ) : isZero ? (
                                <span className="text-gray-500 text-xs">Balanced</span>
                              ) : isOwes ? (
                                <span className="font-semibold text-red-600 flex items-center justify-end gap-1">
                                  <TrendingUp size={13} /> {fmtAmt(net)}
                                </span>
                              ) : (
                                <span className="font-semibold text-green-700 flex items-center justify-end gap-1">
                                  <TrendingDown size={13} /> {fmtAmt(net)}
                                </span>
                              )}
                            </td>

                            {/* Info tooltip — stop propagation */}
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {item.tooltipDetail && <TooltipInfo text={item.tooltipDetail} />}
                            </td>
                          </tr>

                          {/* Expandable draws panel */}
                          {expanded && (
                            <DrawsPanel
                              records={item.paymentRecords}
                              hidden={hidden}
                              colSpan={9}
                              payoutMonthNumber={item.payoutMonthNumber}
                              netPayoutAmount={item.netPayoutAmount}
                              disbursedAmount={item.disbursedAmount}
                              payoutStatus={item.payoutStatus}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Summary panel */}
          {chitItems.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Settlement Summary</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Chits included</p>
                  <p className="text-2xl font-bold text-gray-800">{includedItems.length}</p>
                  <p className="text-xs text-gray-400">of {chitItems.length} total</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Member owes</p>
                  <p className="text-2xl font-bold text-red-600">
                    {hidden ? '••••••' : `₹${totalOwed.toLocaleString('en-IN')}`}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">Fund refunds</p>
                  <p className="text-2xl font-bold text-green-700">
                    {hidden ? '••••••' : `₹${totalRefunded.toLocaleString('en-IN')}`}
                  </p>
                </div>
              </div>

              {/* Grand total */}
              <div className={`rounded-xl p-5 mb-5 border-2 ${
                grandTotal > 0
                  ? 'bg-red-50 border-red-200'
                  : grandTotal < 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                {grandTotal === 0 ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle size={24} className="text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Result</p>
                      <p className="text-xl font-bold text-gray-700">Accounts balance out — no payment needed.</p>
                    </div>
                  </div>
                ) : grandTotal > 0 ? (
                  <div className="flex items-center gap-3">
                    <TrendingUp size={24} className="text-red-500" />
                    <div>
                      <p className="text-sm text-gray-500">Result</p>
                      <p className="text-xl font-bold text-red-700">
                        Member pays {hidden ? '••••••' : `₹${grandTotal.toLocaleString('en-IN')}`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <TrendingDown size={24} className="text-green-600" />
                    <div>
                      <p className="text-sm text-gray-500">Result</p>
                      <p className="text-xl font-bold text-green-700">
                        Fund refunds {hidden ? '••••••' : `₹${Math.abs(grandTotal).toLocaleString('en-IN')}`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Adjustment */}
              <div className="mb-4 p-4 rounded-xl border border-dashed border-amber-300 bg-amber-50">
                <p className="text-xs font-semibold text-amber-700 mb-3 uppercase tracking-wide">
                  Manual Adjustment (optional)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Adjustment Amount" hint="Use negative to discount (e.g. −500)">
                    <input
                      type="number"
                      step="0.01"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                    />
                  </FormField>
                  <FormField label="Reason for Adjustment">
                    <input
                      type="text"
                      value={adjustmentReason}
                      onChange={(e) => setAdjustmentReason(e.target.value)}
                      placeholder="e.g. Late fee, Goodwill waiver…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                    />
                  </FormField>
                </div>
                {parsedAdjustment !== 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-white border border-amber-200 px-4 py-2">
                    <span className="text-xs text-gray-600">
                      Base: <span className="font-semibold">{hidden ? '••••••' : `₹${Math.abs(grandTotal).toLocaleString('en-IN')}`}</span>
                      <span className="mx-1 text-amber-600">
                        {parsedAdjustment > 0 ? `+₹${parsedAdjustment.toLocaleString('en-IN')}` : `−₹${Math.abs(parsedAdjustment).toLocaleString('en-IN')}`}
                      </span>
                      adjustment
                    </span>
                    <span className={`font-bold text-sm ${adjustedTotal > 0 ? 'text-red-700' : adjustedTotal < 0 ? 'text-green-700' : 'text-gray-600'}`}>
                      {hidden ? '••••••' : (
                        adjustedTotal === 0 ? 'Balanced'
                        : adjustedTotal > 0 ? `Member pays ₹${adjustedTotal.toLocaleString('en-IN')}`
                        : `Fund refunds ₹${Math.abs(adjustedTotal).toLocaleString('en-IN')}`
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mb-4">
                <FormField label="Settlement Notes">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional admin notes for this settlement…"
                    rows={2}
                  />
                </FormField>
              </div>

              {/* Confirm button */}
              <Button
                size="lg"
                className="w-full"
                disabled={includedItems.length === 0}
                onClick={() => setShowConfirm(true)}
              >
                <HandCoins size={18} />
                Confirm Settlement
              </Button>
            </div>
          )}

          {/* Settlement History — always shown when member is selected */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="w-full px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <History size={16} style={{ color: '#1E3A5F' }} />
                  <span className="font-semibold text-gray-700">Past Settlements</span>
                  {!historyLoading && history.length > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#EEF2F8] text-[#1E3A5F]">
                      {history.length}
                    </span>
                  )}
                </div>
                {historyOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {historyOpen && (
                <div className="border-t border-gray-100">
                  {historyLoading ? (
                    <div className="p-6"><PageSpinner /></div>
                  ) : history.length === 0 ? (
                    <EmptyState icon={History} title="No past settlements" message="No previous settlement records for this member." />
                  ) : (
                    <>
                      <Table columns={['Date', 'Net', 'Payment Status', 'Owes', 'Refunded', 'Notes', '']}>
                        {history.map((s) => {
                          const net = Number(s.netAmount);
                          const absNet = Math.abs(net);
                          const isCollect = net > 0;
                          const moved = isCollect ? Number(s.collectedAmount ?? 0) : Number(s.disbursedAmount ?? 0);
                          const remaining = Math.max(0, absNet - moved);
                          const isPending = s.paymentStatus === 'PENDING' || s.paymentStatus === 'PARTIALLY_COLLECTED' || s.paymentStatus === 'PARTIALLY_DISBURSED';
                          const psCfg = {
                            PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Unpaid' },
                            PARTIALLY_COLLECTED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Partial' },
                            PARTIALLY_DISBURSED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Partial' },
                            FULLY_COLLECTED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Done' },
                            FULLY_DISBURSED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Done' },
                            BALANCED: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Balanced' },
                          }[s.paymentStatus] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: s.paymentStatus };
                          return (
                            <Tr key={s.id} onClick={() => { setViewSettlement(s); setExpandedDrawChit(null); }}>
                              <Td className="text-gray-500 text-xs whitespace-nowrap">
                                {new Date(s.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </Td>
                              <Td className={`font-semibold ${net > 0 ? 'text-red-600' : net < 0 ? 'text-green-700' : 'text-gray-500'}`}>
                                {hidden ? '••••••' : (net === 0 ? 'Balanced' : net > 0 ? `+₹${net.toLocaleString('en-IN')}` : `−₹${Math.abs(net).toLocaleString('en-IN')}`)}
                              </Td>
                              <Td>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${psCfg.bg} ${psCfg.text}`}>
                                  {psCfg.label}
                                </span>
                                {isPending && !hidden && (
                                  <span className="ml-1.5 text-xs text-gray-400">₹{remaining.toLocaleString('en-IN')} left</span>
                                )}
                              </Td>
                              <Td className="text-red-600 font-medium">
                                {hidden ? '••••••' : `₹${Number(s.totalOwed).toLocaleString('en-IN')}`}
                              </Td>
                              <Td className="text-green-700 font-medium">
                                {hidden ? '••••••' : `₹${Number(s.totalRefunded).toLocaleString('en-IN')}`}
                              </Td>
                              <Td className="text-gray-500 text-xs max-w-xs truncate">{s.notes ?? '—'}</Td>
                              <Td>
                                <span className="text-xs font-medium text-[#1E3A5F] flex items-center gap-1">
                                  <Eye size={13} /> View
                                </span>
                              </Td>
                            </Tr>
                          );
                        })}
                      </Table>

                      {/* History pagination */}
                      {historyTotalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                          <span className="text-xs text-gray-500">
                            Page {historyPage + 1} of {historyTotalPages} · {historyTotalElements} records
                          </span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="muted" disabled={historyPage === 0} onClick={() => setHistoryPage((p) => p - 1)}>
                              ← Prev
                            </Button>
                            <Button size="sm" variant="muted" disabled={historyPage >= historyTotalPages - 1} onClick={() => setHistoryPage((p) => p + 1)}>
                              Next →
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
        </>
      )}

      {/* Case Guide Modal */}
      {showCaseGuide && <CaseGuideModal onClose={() => setShowCaseGuide(false)} />}

      {/* Payment Recording Step — shown after settlement is confirmed */}
      {showPaymentStep && confirmedSettlement && (() => {
        const net = Number(confirmedSettlement.netAmount);
        const isCollect = net > 0;
        const absNet = Math.abs(net);
        const enteredAmt = parseFloat(paymentAmount);
        const maxAllowed = confirmedRemaining > 0 ? confirmedRemaining : absNet;
        const isPartial = !isNaN(enteredAmt) && enteredAmt > 0 && enteredAmt < maxAllowed;
        const isValid = !isNaN(enteredAmt) && enteredAmt > 0 && enteredAmt <= maxAllowed;
        const paymentMemberName = allMembers.find((m) => m.id === confirmedSettlement.memberId)?.fullName ?? 'Member';

        const printReceipt = (txn) => {
          const html = generateReceiptHTML({
            txn,
            memberName: paymentMemberName,
            tenantName,
            isCollect,
            netAmount: absNet,
            remainingAmount: Number(txn.remainingAmount ?? 0),
          });
          const w = window.open('', '_blank', 'width=520,height=700');
          w.document.write(html);
          w.document.close();
          w.focus();
          w.print();
        };

        const closePaymentStep = () => {
          setShowPaymentStep(false);
          setConfirmedSettlement(null);
          setConfirmedRemaining(0);
          setRecordedTxn(null);
          if (isNewConfirmation) {
            setSelectedMemberId('');
            qc.invalidateQueries({ queryKey: ['settlement-pending-payments'] });
          }
        };

        // ── Receipt step (shown after payment recorded) ─────────────────────
        if (recordedTxn) {
          const remaining = Number(recordedTxn.remainingAmount ?? 0);
          const modeLabel = { CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', UPI: 'UPI' }[recordedTxn.mode] ?? recordedTxn.mode;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                <div className={`px-6 py-5 border-b border-gray-100 rounded-t-2xl ${isCollect ? 'bg-green-50' : 'bg-[#EEF2F8]'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✓</span>
                    <h2 className="text-lg font-bold text-gray-900">Payment Recorded</h2>
                  </div>
                  <p className={`text-sm mt-1 font-semibold ${isCollect ? 'text-green-700' : 'text-[#1E3A5F]'}`}>
                    ₹{Number(recordedTxn.amount).toLocaleString('en-IN')} {isCollect ? 'collected from' : 'disbursed to'} {paymentMemberName}
                  </p>
                </div>
                <div className="px-6 py-4 space-y-2">
                  <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Mode</span>
                    <span className="font-semibold">{modeLabel}</span>
                  </div>
                  {recordedTxn.referenceNumber && (
                    <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Reference</span>
                      <span className="font-semibold font-mono text-xs">{recordedTxn.referenceNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Settlement total</span>
                    <span className="font-semibold">₹{absNet.toLocaleString('en-IN')}</span>
                  </div>
                  {remaining > 0 ? (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-700 font-medium">
                      ₹{remaining.toLocaleString('en-IN')} still to {isCollect ? 'collect' : 'disburse'} — partial payment recorded.
                    </div>
                  ) : (
                    <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm text-green-700 font-semibold">
                      Fully {isCollect ? 'collected' : 'disbursed'} ✓
                    </div>
                  )}
                </div>
                <div className="px-6 pb-5 flex gap-3">
                  <Button size="lg" className="flex-1" onClick={() => printReceipt(recordedTxn)}>
                    <Printer size={15} /> Print Receipt
                  </Button>
                  {remaining > 0 && (
                    <Button variant="secondary" size="lg" onClick={() => {
                      setPaymentAmount(String(remaining));
                      setConfirmedRemaining(remaining);
                      setPaymentMethod('');
                      setPaymentReference('');
                      setPaymentNotes('');
                      setRecordedTxn(null);
                    }}>
                      Record More
                    </Button>
                  )}
                  <Button variant="muted" size="lg" onClick={closePaymentStep}>Close</Button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className={`px-6 py-5 border-b border-gray-100 rounded-t-2xl flex items-start justify-between ${isCollect ? 'bg-red-50' : 'bg-green-50'}`}>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Record Payment</h2>
                  <p className={`text-sm mt-1 font-medium ${isCollect ? 'text-red-700' : 'text-green-700'}`}>
                    {isCollect
                      ? `₹${maxAllowed.toLocaleString('en-IN')} remaining to collect`
                      : `₹${maxAllowed.toLocaleString('en-IN')} remaining to disburse`}
                  </p>
                  {maxAllowed < absNet && (
                    <p className="text-xs text-gray-400 mt-0.5">Total: ₹{absNet.toLocaleString('en-IN')} · Already paid: ₹{(absNet - maxAllowed).toLocaleString('en-IN')}</p>
                  )}
                  {isNewConfirmation && (
                    <p className="text-xs text-gray-500 mt-0.5">Settlement confirmed. Member marked Inactive.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closePaymentStep}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Amount {isPartial && <span className="text-amber-600 font-medium">(partial)</span>}
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={`Max ₹${maxAllowed.toLocaleString('en-IN')}`}
                    min={1}
                    max={maxAllowed}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
                  />
                  {isPartial && (
                    <p className="text-xs text-amber-600 mt-1">
                      Remaining ₹{(maxAllowed - enteredAmt).toLocaleString('en-IN')} will stay as partially {isCollect ? 'collected' : 'disbursed'}.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Payment Method</p>
                  <div className="grid grid-cols-3 gap-2">
                    {['CASH', 'BANK_TRANSFER', 'UPI'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer ${
                          paymentMethod === m
                            ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                            : 'border-gray-200 text-gray-600 hover:border-[#1E3A5F]/40'
                        }`}
                      >
                        {m === 'BANK_TRANSFER' ? 'Bank' : m === 'CASH' ? 'Cash' : 'UPI'}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod && paymentMethod !== 'CASH' && (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Reference / UTR Number</label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Transaction ID / UTR…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Optional payment note…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={!paymentMethod || !isValid || recordPaymentMutation.isPending}
                    onClick={() => recordPaymentMutation.mutate()}
                    loading={recordPaymentMutation.isPending}
                  >
                    {isPartial ? 'Record Partial Payment' : 'Record Full Payment'}
                  </Button>
                  <Button variant="muted" size="lg" type="button" onClick={() => {
                    if (isNewConfirmation) toast.success('Find it in "Awaiting Settlement Payment" to record payment later.');
                    closePaymentStep();
                  }}>
                    Record Later
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      </>} {/* end !showHistoryView */}

      {/* Settlement Detail Modal — available in both views */}
      {viewSettlement && (() => {
        const s = viewSettlement;
        const net = Number(s.netAmount);
        const absNet = Math.abs(net);
        const isCollect = net > 0;
        // Use live settlementTxns for accurate remaining (refreshes after each payment)
        const paidSoFar = settlementTxns.reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
        const remaining = Math.max(0, absNet - paidSoFar);
        const memberName = allMembers.find((m) => m.id === s.memberId)?.fullName ?? `Member ${String(s.memberId).slice(-6)}`;
        const isVoided = s.paymentStatus === 'VOIDED';

        const printSettlement = async () => {
          const chitItems = s.chitItems ?? [];
          const itemsWithRecords = await Promise.all(
            chitItems.map(async (item) => {
              try {
                const records = item.chitId
                  ? await getMemberPaymentHistoryByChit(s.memberId, item.chitId)
                  : [];
                return { ...item, paymentRecords: records };
              } catch {
                return { ...item, paymentRecords: [] };
              }
            })
          );
          const totalOwedAmt  = Number(s.totalOwed ?? 0);
          const totalRefundAmt = Number(s.totalRefunded ?? 0);
          const grandTotalAmt  = Number(s.netAmount ?? 0);
          const html = generatePrintHTML({
            items: itemsWithRecords,
            member: { fullName: memberName },
            totalOwed: totalOwedAmt,
            totalRefunded: totalRefundAmt,
            grandTotal: grandTotalAmt,
            tenantName,
            adjustmentAmount: Number(s.adjustmentAmount ?? 0),
            adjustmentReason: s.adjustmentReason ?? '',
          });
          const w = window.open('', '_blank', 'width=900,height=700');
          w.document.write(html);
          w.document.close();
          w.focus();
          w.print();
        };

        return (
          <Modal title={`Settlement — ${memberName}`} onClose={() => { setViewSettlement(null); setExpandedDrawChit(null); }} size="lg">
            <div className="space-y-4">
              {isVoided && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">This settlement has been voided</p>
                    <p className="text-xs text-red-500 mt-0.5">All associated payment records have been reverted to Outstanding.</p>
                  </div>
                </div>
              )}

              {/* Summary card */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Total Owed</p>
                  <p className="text-lg font-bold text-red-600">{hidden ? '••••••' : `₹${Number(s.totalOwed).toLocaleString('en-IN')}`}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Refunded</p>
                  <p className="text-lg font-bold text-green-700">{hidden ? '••••••' : `₹${Number(s.totalRefunded).toLocaleString('en-IN')}`}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net {isCollect ? 'Payable' : 'Refundable'}</p>
                  <p className={`text-lg font-bold ${isCollect ? 'text-red-600' : 'text-green-700'}`}>{hidden ? '••••••' : `₹${absNet.toLocaleString('en-IN')}`}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Remaining</p>
                  <p className={`text-lg font-bold ${remaining > 0 && !isVoided ? 'text-amber-600' : 'text-gray-400'}`}>
                    {isVoided ? '—' : (hidden ? '••••••' : `₹${remaining.toLocaleString('en-IN')}`)}
                  </p>
                </div>
              </div>

              {/* Meta */}
              <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                <span>Settled: <strong>{new Date(s.settledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></span>
                {s.notes && <span className="italic text-gray-400">"{s.notes}"</span>}
              </div>

              {/* Chit breakdown */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Chit Breakdown</p>
                <div className="space-y-2">
                  {(s.chitItems ?? []).map((item) => {
                    const itemNet = Number(item.netAmount);
                    const isItemCollect = itemNet >= 0;
                    const isExpanded = expandedDrawChit === item.chitId;
                    return (
                      <div key={item.chitId} className="border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedDrawChit(isExpanded ? null : item.chitId);
                          }}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <CaseBadge settlementCase={item.settlementCase} />
                            <div className="min-w-0">
                              <span className="text-sm font-semibold text-gray-800">{item.chitName}</span>
                              {item.payoutStatus && item.payoutStatus !== 'NONE' && (
                                <span className="ml-2"><PayoutStatusPill status={item.payoutStatus} /></span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`text-sm font-bold ${isItemCollect ? 'text-red-600' : 'text-green-700'}`}>
                              {isItemCollect ? '+' : '−'}{hidden ? '••••••' : `₹${Math.abs(itemNet).toLocaleString('en-IN')}`}
                            </span>
                            {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-100 bg-gray-50">
                            {/* Description */}
                            {item.description && (
                              <div className="px-4 pt-3 pb-2">
                                <p className="text-xs text-gray-500 italic leading-relaxed">{item.description}</p>
                              </div>
                            )}

                            {/* Calculation breakdown */}
                            <div className="px-4 pb-3 space-y-1">
                              {/* Payout row — if payout was involved */}
                              {item.payoutStatus && item.payoutStatus !== 'NONE' && (
                                <div className="flex items-center justify-between py-1.5 border-b border-gray-200 mb-1">
                                  <div className="flex items-center gap-2">
                                    <PayoutStatusPill status={item.payoutStatus} />
                                    <span className="text-xs text-gray-500">
                                      {Number(item.netPayoutAmount ?? 0) > 0 && `Net payout ₹${Number(item.netPayoutAmount).toLocaleString('en-IN')}`}
                                      {Number(item.disbursedAmount ?? 0) > 0 && Number(item.disbursedAmount) !== Number(item.netPayoutAmount) && ` · Disbursed ₹${Number(item.disbursedAmount).toLocaleString('en-IN')}`}
                                      {item.settlementMode && ` · Mode: ${item.settlementMode === 'FAIR' ? 'Fair' : 'Admin Win'}`}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Line items: what member owes (+) */}
                              {Number(item.unpaidDues ?? 0) > 0 && (
                                <div className="flex items-center justify-between text-xs py-1">
                                  <span className="text-gray-600">+ Missed installments</span>
                                  <span className="font-semibold text-red-600">{hidden ? '••••••' : `₹${Number(item.unpaidDues).toLocaleString('en-IN')}`}</span>
                                </div>
                              )}
                              {Number(item.futureInstallments ?? 0) > 0 && (
                                <div className="flex items-center justify-between text-xs py-1">
                                  <span className="text-gray-600">+ Remaining installments</span>
                                  <span className="font-semibold text-red-600">{hidden ? '••••••' : `₹${Number(item.futureInstallments).toLocaleString('en-IN')}`}</span>
                                </div>
                              )}

                              {/* Line items: what fund owes back (−) */}
                              {Number(item.payoutCredit ?? 0) > 0 && (
                                <div className="flex items-center justify-between text-xs py-1">
                                  <span className="text-gray-600">− Fund credit (reserved slot / payout owed)</span>
                                  <span className="font-semibold text-green-700">{hidden ? '••••••' : `₹${Number(item.payoutCredit).toLocaleString('en-IN')}`}</span>
                                </div>
                              )}
                              {Number(item.totalPaid ?? 0) > 0 && (item.settlementCase === 'CASE_B1' || item.settlementCase === 'CASE_B2') && (
                                <div className="flex items-center justify-between text-xs py-1">
                                  <span className="text-gray-600">Total paid in by member (refund)</span>
                                  <span className="font-semibold text-green-700">{hidden ? '••••••' : `₹${Number(item.totalPaid).toLocaleString('en-IN')}`}</span>
                                </div>
                              )}

                              {/* Net result */}
                              <div className={`flex items-center justify-between text-xs py-2 px-3 rounded-lg mt-1 ${isItemCollect ? 'bg-red-50' : 'bg-green-50'}`}>
                                <span className={`font-semibold ${isItemCollect ? 'text-red-700' : 'text-green-700'}`}>
                                  {isItemCollect ? 'Member owes' : 'Fund refunds'}
                                </span>
                                <span className={`font-bold text-sm ${isItemCollect ? 'text-red-700' : 'text-green-700'}`}>
                                  {hidden ? '••••••' : `₹${Math.abs(itemNet).toLocaleString('en-IN')}`}
                                </span>
                              </div>
                            </div>

                            {/* Draw-wise payments */}
                            <div className="border-t border-gray-200 px-4 py-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Draw-by-draw payments</p>
                              {drawLoading ? (
                                <div className="py-2 text-xs text-gray-400 text-center">Loading…</div>
                              ) : drawDetails.length === 0 ? (
                                <div className="py-2 text-xs text-gray-400 text-center">No draw records on file</div>
                              ) : (
                                <div className="space-y-0 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                                  {drawDetails.map((draw) => {
                                    const drawStatusCfg = {
                                      SETTLED:            { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Paid' },
                                      OUTSTANDING:        { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Outstanding' },
                                      PARTIALLY_PAID:     { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Partial' },
                                      WAIVED:             { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Waived' },
                                      PAYOUT_DEDUCTED:    { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Deducted' },
                                      SETTLEMENT_CLEARED: { bg: 'bg-[#EEF2F8]', text: 'text-[#1E3A5F]', label: 'Cleared' },
                                    }[draw.status] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: draw.status };
                                    const paid = Number(draw.amountPaid ?? 0);
                                    const due  = Number(draw.amountDue  ?? 0);
                                    const bal  = due - paid;
                                    const isWaived = draw.status === 'WAIVED';
                                    const isPayoutDraw = item.payoutMonthNumber != null && draw.monthNumber === item.payoutMonthNumber && item.payoutStatus && item.payoutStatus !== 'NONE';
                                    return (
                                      <div key={draw.id} className={`flex items-center gap-3 px-3 py-2 ${isPayoutDraw ? 'bg-[#EEF2F8]' : ''}`}>
                                        <div className="w-6 h-6 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                          {draw.monthNumber}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs text-gray-600">Draw {draw.monthNumber}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${drawStatusCfg.bg} ${drawStatusCfg.text}`}>{drawStatusCfg.label}</span>
                                            {isPayoutDraw && (
                                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-[#EEF2F8] text-[#1E3A5F]">
                                                🏆 Payout {hidden ? '••••' : `₹${Number(item.netPayoutAmount ?? 0).toLocaleString('en-IN')}`}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-right text-xs flex-shrink-0">
                                          <span className="font-semibold text-gray-800">{hidden ? '••••' : `₹${paid.toLocaleString('en-IN')}`}</span>
                                          <span className="text-gray-400"> / {hidden ? '••••' : `₹${due.toLocaleString('en-IN')}`}</span>
                                          {!isWaived && bal > 0 && <span className="ml-1.5 text-red-500 font-medium">(₹{bal.toLocaleString('en-IN')} short)</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(s.chitItems ?? []).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No chit breakdown available</p>
                  )}
                </div>
              </div>

              {/* Payment History */}
              {settlementTxns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Payment History</p>
                  <div className="space-y-1.5">
                    {settlementTxns.map((txn) => {
                      const modeLabel = { CASH: 'Cash', BANK_TRANSFER: 'Bank', UPI: 'UPI' }[txn.mode] ?? txn.mode;
                      const txnDate = new Date(txn.recordedAt || txn.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                      const txnIsCollect = txn.direction === 'COLLECTION';
                      const isHighlighted = highlightPaymentId && String(txn.id) === String(highlightPaymentId);
                      const printTxnReceipt = () => {
                        const html = generateReceiptHTML({
                          txn,
                          memberName,
                          tenantName,
                          isCollect: txnIsCollect,
                          netAmount: Math.abs(net),
                          remainingAmount: Number(txn.remainingAmount ?? 0),
                        });
                        const w = window.open('', '_blank', 'width=520,height=700');
                        w.document.write(html);
                        w.document.close();
                        w.focus();
                        w.print();
                      };
                      return (
                        <div
                          key={txn.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${isHighlighted ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-300' : 'border-gray-200 bg-white'}`}
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${txnIsCollect ? 'bg-green-500' : 'bg-[#1E3A5F]'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-gray-800">
                                {hidden ? '••••••' : `₹${Number(txn.amount).toLocaleString('en-IN')}`}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{modeLabel}</span>
                              {txn.referenceNumber && <span className="text-xs text-gray-400 font-mono">{txn.referenceNumber}</span>}
                              {isHighlighted && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-semibold">From Treasury</span>}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{txnDate} · ID: {String(txn.id).slice(0, 8)}…</p>
                          </div>
                          <button
                            type="button"
                            onClick={printTxnReceipt}
                            className="flex items-center gap-1 text-xs text-[#1E3A5F] hover:text-[#1E3A5F]/70 font-medium flex-shrink-0"
                          >
                            <Printer size={12} /> Receipt
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grand Total — always shown */}
              {(() => {
                const adjAmt = Number(s.adjustmentAmount ?? 0);
                const subTotal = Number(s.totalOwed ?? 0) - Number(s.totalRefunded ?? 0);
                const subIsCollect = subTotal >= 0;
                return (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Grand Total</p>
                    {adjAmt !== 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Chits sub-total</span>
                          <span className={`font-semibold ${subIsCollect ? 'text-red-600' : 'text-green-700'}`}>
                            {hidden ? '••••••' : `${subIsCollect ? '' : '−'}₹${Math.abs(subTotal).toLocaleString('en-IN')}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            Adjustment{s.adjustmentReason ? <span className="italic text-gray-400"> — {s.adjustmentReason}</span> : ''}
                          </span>
                          <span className={`font-semibold ${adjAmt > 0 ? 'text-red-600' : 'text-green-700'}`}>
                            {hidden ? '••••••' : `${adjAmt > 0 ? '+' : '−'}₹${Math.abs(adjAmt).toLocaleString('en-IN')}`}
                          </span>
                        </div>
                      </>
                    )}
                    <div className={`flex items-center justify-between text-sm ${adjAmt !== 0 ? 'border-t border-gray-200 pt-1.5' : ''}`}>
                      <span className="font-semibold text-gray-700">{isCollect ? 'Total to collect' : 'Total to disburse'}</span>
                      <span className={`font-bold ${isCollect ? 'text-red-600' : 'text-green-700'}`}>
                        {hidden ? '••••••' : `₹${absNet.toLocaleString('en-IN')}`}
                      </span>
                    </div>
                    {paidSoFar > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Already {isCollect ? 'collected' : 'disbursed'}</span>
                        <span className="font-semibold text-green-700">
                          {hidden ? '••••••' : `−₹${paidSoFar.toLocaleString('en-IN')}`}
                        </span>
                      </div>
                    )}
                    {paidSoFar > 0 && (
                      <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-1.5">
                        <span className="font-semibold text-gray-700">Remaining</span>
                        <span className={`font-bold ${remaining > 0 ? (isCollect ? 'text-red-600' : 'text-green-700') : 'text-green-700'}`}>
                          {hidden ? '••••••' : remaining > 0 ? `₹${remaining.toLocaleString('en-IN')}` : '✓ Fully settled'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Actions */}
              {remaining > 0 && !isVoided && (
                <div className={`rounded-xl p-4 border-2 ${isCollect ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <p className={`text-sm font-semibold mb-3 ${isCollect ? 'text-red-700' : 'text-green-700'}`}>
                    {isCollect
                      ? `₹${remaining.toLocaleString('en-IN')} still to collect from member`
                      : `₹${remaining.toLocaleString('en-IN')} still to pay to member`}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      setViewSettlement(null);
                      setExpandedDrawChit(null);
                      setConfirmedSettlement(s);
                      setPaymentMethod('');
                      setPaymentAmount(String(remaining));
                      setConfirmedRemaining(remaining);
                      setPaymentReference('');
                      setPaymentNotes('');
                      setRecordedTxn(null);
                      setIsNewConfirmation(false);
                      setShowPaymentStep(true);
                    }}
                  >
                    <HandCoins size={14} /> Record Payment
                  </Button>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <Button variant="secondary" size="sm" onClick={printSettlement}>
                  <Printer size={14} /> Print Report
                </Button>
                {!isVoided && (
                  <button
                    type="button"
                    onClick={() => setVoidConfirmId(s.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1.5 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <XCircle size={14} /> Void Settlement
                  </button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Void Confirm Dialog */}
      {voidConfirmId && (
        <ConfirmDialog
          variant="danger"
          title="Void Settlement"
          description="This will void the settlement and revert all SETTLEMENT_CLEARED payment records back to Outstanding. The member can then be re-settled. This action cannot be undone."
          actionLabel="Void Settlement"
          loading={voidMutation.isPending}
          onConfirm={() => voidMutation.mutate(voidConfirmId)}
          onClose={() => setVoidConfirmId(null)}
        />
      )}

      {/* Confirm Dialog */}
      {showConfirm && (
        <ConfirmDialog
          variant="warning"
          title="Confirm Settlement"
          description={`Settle ${selectedMember?.fullName} across ${includedItems.length} chit${includedItems.length !== 1 ? 's' : ''}. This action cannot be undone.`}
          actionLabel="Yes, Confirm Settlement"
          onConfirm={() => confirmMutation.mutate()}
          onClose={() => setShowConfirm(false)}
          loading={confirmMutation.isPending}
        >
          <div className="space-y-3 pb-2">
            <div className={`rounded-lg p-3 text-sm font-semibold ${
              adjustedTotal > 0 ? 'bg-red-50 text-red-700'
              : adjustedTotal < 0 ? 'bg-green-50 text-green-700'
              : 'bg-gray-50 text-gray-600'
            }`}>
              {adjustedTotal === 0
                ? 'Accounts balance out — no payment needed.'
                : adjustedTotal > 0
                ? `Member pays ₹${adjustedTotal.toLocaleString('en-IN')}`
                : `Fund refunds ₹${Math.abs(adjustedTotal).toLocaleString('en-IN')}`}
            </div>
            {parsedAdjustment !== 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-0.5">
                <div className="flex justify-between">
                  <span>Base settlement</span>
                  <span className="font-medium">{grandTotal > 0 ? `+₹${grandTotal.toLocaleString('en-IN')}` : grandTotal < 0 ? `−₹${Math.abs(grandTotal).toLocaleString('en-IN')}` : '₹0'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Adjustment{adjustmentReason ? ` — ${adjustmentReason}` : ''}</span>
                  <span className="font-medium">{parsedAdjustment > 0 ? `+₹${parsedAdjustment.toLocaleString('en-IN')}` : `−₹${Math.abs(parsedAdjustment).toLocaleString('en-IN')}`}</span>
                </div>
              </div>
            )}
            <div className="text-xs text-gray-500 space-y-1">
              {includedItems.map((i) => (
                <div key={i.chitId} className="flex justify-between">
                  <span>{i.chitName}</span>
                  <span className={Number(i.displayNetAmount) >= 0 ? 'text-red-600' : 'text-green-600'}>
                    {Number(i.displayNetAmount) >= 0
                      ? `owes ₹${Number(i.displayNetAmount).toLocaleString('en-IN')}`
                      : `refund ₹${Math.abs(Number(i.displayNetAmount)).toLocaleString('en-IN')}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
