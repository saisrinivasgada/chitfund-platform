import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMembers, getSettlementPreview, confirmSettlement, getMemberSettlements,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
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
  Printer, BookOpen,
} from 'lucide-react';

// ─── Case badge styling ────────────────────────────────────────────────────
const CASE_COLORS = {
  CASE_A:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'A' },
  CASE_B1: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'B' },
  CASE_B2: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'B' },
  CASE_C:  { bg: 'bg-purple-100', text: 'text-purple-700', label: 'C' },
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
    PARTIALLY_DISBURSED: { bg: 'bg-purple-100', text: 'text-purple-700' },
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
function TooltipInfo({ text }) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState(null);

  return (
    <>
      <span
        className="inline-flex cursor-help"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setCoords({ x: r.left + r.width / 2, y: r.top });
          setShow(true);
        }}
        onMouseLeave={() => setShow(false)}
      >
        <Info size={14} className="text-gray-400 hover:text-[#1E3A5F] transition-colors" />
      </span>
      {show && coords && (
        <div
          className="fixed z-[9999] w-80 bg-gray-900 text-gray-100 rounded-xl shadow-2xl p-4 pointer-events-none"
          style={{ left: coords.x, top: coords.y - 12, transform: 'translate(-50%, -100%)' }}
        >
          <pre className="text-xs whitespace-pre-wrap leading-relaxed font-mono">{text}</pre>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0
            border-l-[6px] border-r-[6px] border-t-[6px]
            border-l-transparent border-r-transparent border-t-gray-900" />
        </div>
      )}
    </>
  );
}

// ─── Status pill for payment records ──────────────────────────────────────
const RECORD_STATUS = {
  SETTLED:          { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Settled' },
  PAYOUT_DEDUCTED:  { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Deducted' },
  WAIVED:           { bg: 'bg-gray-100',   text: 'text-gray-500',   label: 'Waived' },
  OUTSTANDING:      { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Outstanding' },
  PARTIALLY_PAID:   { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Partial' },
  SETTLEMENT_CLEARED: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Cleared' },
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
                  return (
                    <Fragment key={r.monthNumber}>
                      <tr className={`transition-colors ${isPayoutDraw ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                        <td className="px-3 py-2 font-medium text-gray-700">
                          Draw {r.monthNumber}
                          <span className="ml-1 text-gray-400 font-normal text-[10px]">(Month {r.monthNumber})</span>
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
                        <td className={`px-3 py-2 text-right font-semibold ${bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {hidden ? '••••••' : bal === 0 ? '—' : fmt(bal)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <RecordStatusPill status={r.status} />
                        </td>
                      </tr>
                      {isPayoutDraw && (
                        <tr className="bg-blue-50 border-t border-blue-100">
                          <td colSpan={6} className="px-3 py-1.5">
                            <div className="flex items-center gap-3 text-[11px] text-blue-700">
                              <span className="font-semibold text-blue-800">Payout draw</span>
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

// ─── Print report generator ───────────────────────────────────────────────
function generatePrintHTML({ items, member, totalOwed, totalRefunded, grandTotal }) {
  const fmtAmt = (n) => `₹${Math.abs(Number(n ?? 0)).toLocaleString('en-IN')}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const now = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const caseLabel = { CASE_A: 'Case A — Payout Disbursed', CASE_B1: 'Case B1 — Reserved Slot', CASE_B2: 'Case B2 — No Payout / No Slot', CASE_C: 'Case C — Partial Payout' };
  const payoutLabel = { DISBURSED: 'Disbursed', PARTIALLY_DISBURSED: 'Partially Disbursed', PENDING: 'Pending', NONE: 'None' };
  const recLabel = { SETTLED: 'Settled', OUTSTANDING: 'Outstanding', PARTIALLY_PAID: 'Partial', PAYOUT_DEDUCTED: 'Payout Deducted', WAIVED: 'Waived', SETTLEMENT_CLEARED: 'Cleared' };

  const chitSections = items.map((item) => {
    const records = item.paymentRecords ?? [];
    const totDue  = records.reduce((s, r) => s + Number(r.amountDue  ?? 0), 0);
    const totPaid = records.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);
    const totBal  = records.reduce((s, r) => s + Number(r.balance    ?? 0), 0);
    const net = Number(item.displayNetAmount ?? 0);
    const hasP = item.payoutMonthNumber != null && item.payoutStatus && item.payoutStatus !== 'NONE';

    const payoutLine = hasP ? `<div class="pout"><b>Payout — Draw ${item.payoutMonthNumber}:</b> Net ${fmtAmt(item.netPayoutAmount)} &nbsp;·&nbsp; Disbursed ${fmtAmt(item.disbursedAmount)} &nbsp;·&nbsp; ${payoutLabel[item.payoutStatus] ?? item.payoutStatus}${item.payoutStatus === 'PARTIALLY_DISBURSED' ? ` &nbsp;·&nbsp; Still owed: ${fmtAmt(Number(item.netPayoutAmount ?? 0) - Number(item.disbursedAmount ?? 0))}` : ''}</div>` : '';

    const rows = records.map((r) => {
      const bal = Number(r.balance ?? 0);
      const isPR = hasP && r.monthNumber === item.payoutMonthNumber;
      return `<tr${isPR ? ' class="pr"' : ''}><td>Draw ${r.monthNumber}<span class="mn"> (Month ${r.monthNumber})</span></td><td>${fmtDate(r.dueDate)}</td><td class="r">${fmtAmt(r.amountDue)}</td><td class="r">${fmtAmt(r.amountPaid)}</td><td class="r ${bal > 0 ? 'owe' : bal < 0 ? 'crd' : ''}">${bal === 0 ? '—' : fmtAmt(bal)}</td><td class="c">${recLabel[r.status] ?? r.status}${isPR ? ' ← payout draw' : ''}</td></tr>`;
    }).join('');

    const table = records.length > 0 ? `<table><thead><tr><th>Draw</th><th>Due Date</th><th class="r">Amount Due</th><th class="r">Amount Paid</th><th class="r">Balance</th><th class="c">Status</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2"><b>Sub-total</b></td><td class="r"><b>${fmtAmt(totDue)}</b></td><td class="r"><b>${fmtAmt(totPaid)}</b></td><td class="r ${totBal > 0 ? 'owe' : totBal < 0 ? 'crd' : ''}"><b>${totBal === 0 ? '—' : fmtAmt(totBal)}</b></td><td></td></tr></tfoot></table>` : `<p class="norec">No payment records on file.</p>`;
    const modeNote = item.settlementCase === 'CASE_C' ? ` · Mode: ${item.displayMode === 'FAIR' ? 'Fair' : 'Admin Win'}` : '';
    const netCls = net > 0 ? 'owe' : net < 0 ? 'crd' : '';
    const netLbl = net === 0 ? 'Balanced' : net > 0 ? `Member owes ${fmtAmt(net)}` : `Fund refunds ${fmtAmt(net)}`;

    return `<div class="chit"><div class="ch"><span class="cn">${item.chitName}</span><span class="cm"> · ${item.chitStatus} · ${caseLabel[item.settlementCase] ?? item.settlementCase}${modeNote}</span></div>${payoutLine}${table}<div class="nl ${netCls}">${netLbl}</div></div>`;
  }).join('');

  const gc = grandTotal > 0 ? 'owe' : grandTotal < 0 ? 'crd' : '';
  const gl = grandTotal === 0 ? 'Balanced — no payment needed' : grandTotal > 0 ? `Member pays ${fmtAmt(grandTotal)}` : `Fund refunds ${fmtAmt(grandTotal)}`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Settlement Report — ${member?.fullName ?? ''}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;line-height:1.5;padding:20px 24px}.rh{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1E3A5F;padding-bottom:10px;margin-bottom:18px}h1{font-size:17px;font-weight:700;color:#1E3A5F}.sh{font-size:12px;font-weight:600;color:#1E3A5F;margin-top:3px}.mt{font-size:9.5px;color:#666;text-align:right;line-height:1.7}.chit{margin-bottom:18px;border:1px solid #ccd;border-radius:5px;overflow:hidden;page-break-inside:avoid}.ch{background:#EFF4FA;padding:8px 12px;border-bottom:1px solid #ccd}.cn{font-size:12px;font-weight:700;color:#1E3A5F}.cm{font-size:10px;color:#555}.pout{background:#EEF6FF;padding:5px 12px;border-bottom:1px solid #BDD7EE;font-size:10px;color:#1a4a7a}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#f4f6fa;padding:5px 10px;text-align:left;font-weight:600;color:#444;border-bottom:1px solid #ccd}td{padding:4px 10px;border-bottom:1px solid #eef;color:#333}tfoot td{background:#f4f6fa;border-top:2px solid #bbc;padding:5px 10px}.r{text-align:right}.c{text-align:center}.owe{color:#c0392b}.crd{color:#1a9150}tr.pr{background:#EEF6FF}.mn{color:#999;font-size:9px}.norec{padding:8px 12px;font-size:10px;color:#aaa;font-style:italic}.nl{padding:7px 12px;font-size:11px;font-weight:600;border-top:1px solid #ccd}.nl.owe{background:#fff5f5;color:#c0392b}.nl.crd{background:#f0fff4;color:#1a9150}.nl:not(.owe):not(.crd){background:#f9f9f9;color:#555}.gt{margin-top:16px;border:2px solid #1E3A5F;border-radius:5px;padding:14px 16px;page-break-inside:avoid}.gt h2{font-size:12px;font-weight:700;color:#1E3A5F;padding-bottom:8px;border-bottom:1px solid #ccd;margin-bottom:8px}.gr{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}.gf{display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:8px 0 0;border-top:2px solid #1E3A5F;margin-top:6px}.ft{margin-top:16px;padding-top:8px;border-top:1px solid #dde;display:flex;justify-content:space-between;font-size:9px;color:#aaa}@media print{body{padding:12px 16px}.chit{page-break-inside:avoid}}</style></head><body><div class="rh"><div><h1>Settlement Report</h1><div class="sh">${member?.fullName ?? 'Unknown Member'}</div></div><div class="mt"><div>Generated: ${now}</div><div>Chits included: ${items.length}</div></div></div>${chitSections}<div class="gt"><h2>Grand Total — All ${items.length} Chit${items.length !== 1 ? 's' : ''}</h2><div class="gr"><span>Member owes (sum)</span><span class="owe">${fmtAmt(totalOwed)}</span></div><div class="gr"><span>Fund refunds (sum)</span><span class="crd">${fmtAmt(totalRefunded)}</span></div><div class="gf"><span>Net Settlement</span><span class="${gc}">${gl}</span></div></div><div class="ft"><span>ChitWise — Chitfund Management Platform</span><span>CONFIDENTIAL — Internal use only</span></div></body></html>`;
}

// ─── Case A/B/C guide modal ───────────────────────────────────────────────
const CASE_DEFS = [
  {
    label: 'A',
    badgeBg: 'bg-blue-600',
    headerBg: 'bg-blue-50',
    borderColor: 'border-blue-200',
    accentText: 'text-blue-700',
    title: 'Payout Fully Disbursed',
    icon: '✓',
    iconBg: 'bg-blue-100 text-blue-700',
    when: 'The member already won a draw and received the complete payout.',
    formula: 'Member owes = Unpaid past dues + Future installments',
    steps: [
      { label: 'Unpaid past dues', desc: 'Months before exit with missing payments' },
      { label: 'Future installments', desc: 'Remaining months the member would owe (can be waived)' },
    ],
    example: {
      setup: '12-month chit, ₹10,000/month. Won Draw 4, received ₹72,000.',
      calc: [
        ['Paid months 1–3', '₹30,000 paid'],
        ['Unpaid months 4–6', '₹30,000 owed'],
        ['Future months 7–12', 'Waived on exit'],
      ],
      result: { label: 'Member owes', amount: '₹30,000', color: 'text-red-600' },
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
    when: 'Member never received a payout but has a pre-booked slot in a future draw.',
    formula: 'Fund refunds = Reserved payout amount − Unpaid dues',
    steps: [
      { label: 'Reserved payout', desc: 'The amount set aside for this member\'s future draw' },
      { label: 'Minus unpaid dues', desc: 'Outstanding payments deducted before refund' },
    ],
    example: {
      setup: '10-month chit, ₹10,000/month. Reserved slot in Draw 8 (reserved: ₹62,000).',
      calc: [
        ['Reserved payout', '₹62,000'],
        ['Unpaid dues', '−₹20,000'],
      ],
      result: { label: 'Fund refunds', amount: '₹42,000', color: 'text-green-700' },
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
    formula: 'Member owes = Unpaid past dues only (future installments are waived)',
    steps: [
      { label: 'Unpaid past dues', desc: 'Only the missed payments from past months' },
      { label: 'Future installments', desc: 'Fully waived — member is exiting the chit' },
    ],
    example: {
      setup: '10-month chit, ₹10,000/month. Paid months 1–3 only.',
      calc: [
        ['Paid (months 1–3)', '₹30,000 settled'],
        ['Missed (months 4–5)', '₹20,000 owed'],
        ['Future (months 6–10)', 'Waived'],
      ],
      result: { label: 'Member owes', amount: '₹20,000', color: 'text-red-600' },
    },
  },
  {
    label: 'C',
    badgeBg: 'bg-purple-600',
    headerBg: 'bg-purple-50',
    borderColor: 'border-purple-200',
    accentText: 'text-purple-700',
    title: 'Partial Payout — Admin Chooses Mode',
    icon: '◑',
    iconBg: 'bg-purple-100 text-purple-700',
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
export default function SettlementTab({ initialMemberId = '' }) {
  const toast = useToastContext();
  const qc = useQueryClient();
  const { hidden } = useHiddenAmounts();

  const [selectedMemberId, setSelectedMemberId] = useState(initialMemberId);
  const [toggledChits, setToggledChits] = useState({}); // chitId → true/false
  const [modes, setModes] = useState({});               // chitId → 'FAIR' | 'ADMIN_WIN'
  const [expandedChits, setExpandedChits] = useState({}); // chitId → true/false
  const [notes, setNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [showCaseGuide, setShowCaseGuide] = useState(false);

  // ── Data queries ───────────────────────────────────────────────────────
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: getMembers,
    staleTime: 300_000,
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
    staleTime: 0,   // always fresh
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

  // Settlement history for selected member
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['settlement-history', selectedMemberId],
    queryFn: () => getMemberSettlements(selectedMemberId),
    enabled: !!selectedMemberId && historyOpen,
    staleTime: 60_000,
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
      });
    },
    onSuccess: () => {
      toast.success('Settlement confirmed successfully');
      qc.invalidateQueries({ queryKey: ['settlement-preview', selectedMemberId] });
      qc.invalidateQueries({ queryKey: ['settlement-history', selectedMemberId] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      setShowConfirm(false);
      setSelectedMemberId('');
      setToggledChits({});
      setModes({});
      setNotes('');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Settlement failed'),
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
    });
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [includedItems, selectedMember, totalOwed, totalRefunded, grandTotal]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
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
                            className={`border-b border-gray-100 transition-colors ${included ? 'bg-white' : 'bg-gray-50 opacity-60'} ${hasRecords ? 'cursor-pointer hover:bg-blue-50/30' : ''}`}
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
                                      ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
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

              <div className="grid grid-cols-3 gap-4 mb-6">
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

          {/* Settlement History */}
          {chitItems.length > 0 && (
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
                    <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
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
                    <Table columns={['Date', 'Settled By', 'Owes', 'Refunded', 'Net', 'Notes']}>
                      {history.map((s) => {
                        const net = Number(s.netAmount);
                        return (
                          <Tr key={s.id}>
                            <Td className="text-gray-500 text-xs whitespace-nowrap">
                              {new Date(s.settledAt).toLocaleDateString('en-IN', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })}
                            </Td>
                            <Td className="text-gray-600 text-sm font-mono text-xs">
                              {String(s.settledBy).slice(0, 8)}…
                            </Td>
                            <Td className="text-red-600 font-medium">
                              {hidden ? '••••••' : `₹${Number(s.totalOwed).toLocaleString('en-IN')}`}
                            </Td>
                            <Td className="text-green-700 font-medium">
                              {hidden ? '••••••' : `₹${Number(s.totalRefunded).toLocaleString('en-IN')}`}
                            </Td>
                            <Td className={`font-semibold ${net > 0 ? 'text-red-600' : net < 0 ? 'text-green-700' : 'text-gray-500'}`}>
                              {hidden ? '••••••' : (
                                net === 0 ? 'Balanced'
                                : net > 0 ? `+₹${net.toLocaleString('en-IN')}`
                                : `−₹${Math.abs(net).toLocaleString('en-IN')}`
                              )}
                            </Td>
                            <Td className="text-gray-500 text-xs max-w-xs truncate">
                              {s.notes ?? '—'}
                            </Td>
                          </Tr>
                        );
                      })}
                    </Table>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Case Guide Modal */}
      {showCaseGuide && <CaseGuideModal onClose={() => setShowCaseGuide(false)} />}

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
              grandTotal > 0 ? 'bg-red-50 text-red-700'
              : grandTotal < 0 ? 'bg-green-50 text-green-700'
              : 'bg-gray-50 text-gray-600'
            }`}>
              {grandTotal === 0
                ? 'Accounts balance out — no payment needed.'
                : grandTotal > 0
                ? `Member pays ₹${grandTotal.toLocaleString('en-IN')}`
                : `Fund refunds ₹${Math.abs(grandTotal).toLocaleString('en-IN')}`}
            </div>
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
