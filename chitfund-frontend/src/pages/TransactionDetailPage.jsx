import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle, Clock, XCircle, Banknote, CreditCard, Building2,
  User, FileText, Calendar, Hash, Layers, AlertCircle, Receipt, AlertTriangle,
  Mail, MapPin, Phone, Copy, Check, IndianRupee, Users, CalendarDays, ShieldCheck,
  Printer,
} from 'lucide-react';
import {
  getPaymentBatchById, getChit, listStaff, getDraws,
  getMembers, remitPayment, voidPaymentBatch,
  getMemberTotalBalance, getMemberBalance, getChitsForMember,
  getMyMemberProfile,
} from '../services/api';
import { useToastContext } from '../components/layout/AppLayout';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useHiddenAmounts } from '../hooks/useHiddenAmounts';
import RoleBadge from '../components/ui/RoleBadge';

const STATUS_CONFIG = {
  COMPLETED:           { label: 'Completed',           icon: CheckCircle, bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', dot: 'bg-green-500' },
  AWAITING_REMITTANCE: { label: 'Awaiting Remittance', icon: Clock,       bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500' },
  VOIDED:              { label: 'Voided',               icon: XCircle,     bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',   dot: 'bg-red-500' },
};

const MODE_ICON = {
  CASH: Banknote,
  UPI:  CreditCard,
  CREDIT: CreditCard,
  BANK: Building2, NEFT: Building2, RTGS: Building2, IMPS: Building2,
  BANK_TRANSFER: Building2,
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtAmt(v) { return '₹' + Number(v ?? 0).toLocaleString('en-IN'); }
function utc(str) { return str ? (str.endsWith('Z') ? str : str + 'Z') : null; }
function fmtDateTime(dt) {
  if (!dt) return '—';
  const d = new Date(utc(dt));
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(utc(dt)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CopyableId({ value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).then(done).catch(() => fallbackCopy(value, done));
    } else {
      fallbackCopy(value, done);
    }
  }
  function fallbackCopy(text, done) {
    const el = document.createElement('textarea');
    el.value = text; el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand('copy'); document.body.removeChild(el); done();
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 font-mono text-xs text-gray-400 hover:text-gray-700 transition-colors cursor-pointer group"
      title="Copy transaction ID"
    >
      <span className="truncate max-w-[220px]">{value}</span>
      {copied
        ? <Check size={12} className="text-green-500 flex-shrink-0" />
        : <Copy size={12} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </button>
  );
}

function InfoRow({ icon: Icon, label, value, valueClass = '' }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mt-0.5">
        <Icon size={15} className="text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-sm font-medium text-gray-800 break-words ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <Icon size={15} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="px-5">{children}</div>
    </div>
  );
}

export default function TransactionDetailPage() {
  const { batchId } = useParams();
  const navigate    = useNavigate();
  const toast       = useToastContext();
  const qc          = useQueryClient();
  const { user }    = useAuth();
  const isMember    = user?.role === 'MEMBER';
  const [showRemitConfirm, setShowRemitConfirm] = useState(false);
  const [showVoidForm,    setShowVoidForm]    = useState(false);
  const [voidReason,      setVoidReason]      = useState('');
  const { hidden } = useHiddenAmounts();
  const h = (v) => hidden ? '••••••' : fmtAmt(v);

  function handlePrintReceipt() {
    window.print();
  }

  const { data: batch, isLoading, isError, error: batchError } = useQuery({
    queryKey: ['batch', batchId],
    queryFn:  () => getPaymentBatchById(batchId),
    enabled:  !!batchId,
    retry: 1,
  });

  const { data: chit } = useQuery({
    queryKey: ['chit', batch?.chitId],
    queryFn:  () => getChit(batch.chitId),
    enabled:  !!batch?.chitId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn:  listStaff,
    enabled:  !isMember,
  });

  // Build a combined name map: staff + all members — resolves any UUID in collectedBy/remittedBy.
  // Cash batches store memberId as the user-service UUID (userId), not the member profile UUID,
  // so we look up by m.userId first, then fall back to m.id for non-cash batches.
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members', 'all'],
    queryFn:  () => getMembers({ size: 500 }),
    enabled:  !isMember,
  });

  // Member users fetch their own profile to populate the Member card on the receipt
  const { data: myProfile } = useQuery({
    queryKey: ['myMemberProfile'],
    queryFn:  getMyMemberProfile,
    enabled:  isMember,
    staleTime: 5 * 60_000,
  });

  const member = allMembers.find(m => m.userId === batch?.memberId)
    ?? allMembers.find(m => m.id === batch?.memberId)
    ?? null;

  const { data: draws = [] } = useQuery({
    queryKey: ['draws', batch?.chitId],
    queryFn:  () => getDraws(batch.chitId),
    enabled:  !!batch?.chitId && !isMember,
  });

  // Member outstanding dues (cross-chit) — admin only
  const { data: totalBalance } = useQuery({
    queryKey: ['memberTotalBalance', batch?.memberId],
    queryFn:  () => getMemberTotalBalance(batch.memberId),
    enabled:  !!batch?.memberId && !isMember,
  });
  const { data: memberChits = [] } = useQuery({
    queryKey: ['memberChits', batch?.memberId],
    queryFn:  () => getChitsForMember(batch.memberId),
    enabled:  !!batch?.memberId && !isMember,
  });
  const { data: perChitBalances } = useQuery({
    queryKey: ['memberBalancesAllChits', batch?.memberId, memberChits.map(c => c.id).join(',')],
    queryFn:  async () => {
      const results = await Promise.all(
        memberChits.map((c) => getMemberBalance({ memberId: batch.memberId, chitId: c.id }))
      );
      return results.map((b, i) => ({ ...b, chitName: memberChits[i].name, chitId: memberChits[i].id }));
    },
    enabled: memberChits.length > 0 && !!batch?.memberId && !isMember,
  });

  // Remit mutation — mark cash as received from collector
  const remitMutation = useMutation({
    mutationFn: () => remitPayment(batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batch', batchId] });
      qc.invalidateQueries({ queryKey: ['pending-remittance'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      toast.success('Cash collected — payment settled');
      setShowRemitConfirm(false);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message ?? 'Failed to remit payment');
      setShowRemitConfirm(false);
    },
  });

  const voidMutation = useMutation({
    mutationFn: () => voidPaymentBatch({ batchId, reason: voidReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batch', batchId] });
      qc.invalidateQueries({ queryKey: ['paymentBatches'] });
      qc.invalidateQueries({ queryKey: ['wallet-balance'] });
      qc.invalidateQueries({ queryKey: ['wallet-transactions'] });
      toast.success('Transaction voided — payment records reversed');
      setShowVoidForm(false);
      setVoidReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Void failed'),
  });

  // Unified name lookup: staff first, then members (covers admin-as-staff, member UUIDs, etc.)
  const nameMap = Object.fromEntries([
    ...allMembers.flatMap((m) => {
      const name = m.fullName ?? m.name;
      return m.userId ? [[m.id, name], [m.userId, name]] : [[m.id, name]];
    }),
    ...staff.map((s) => [s.id, s.fullName ?? s.username]),
  ]);
  const roleMap = Object.fromEntries(staff.map((s) => [s.id, s.role]));

  // Resolve a UUID to a display name — falls back to "Admin" when the actor
  // is an admin user (not present in staff or members list)
  function resolveName(id) {
    if (!id) return '—';
    return nameMap[id] ?? 'Admin';
  }

  // Replace bare UUID patterns inside free-form text (e.g. notes written by the system)
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  function resolveText(text) {
    if (!text) return text;
    return text.replace(UUID_RE, (id) => nameMap[id] ?? id.slice(-6));
  }

  const drawByMonth = Object.fromEntries(draws.map((d) => [d.monthNumber, d]));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-gray-400 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          Loading transaction…
        </div>
      </div>
    );
  }

  if (isError || (!isLoading && !batch)) {
    const status = batchError?.response?.status;
    navigate('/error', {
      replace: true,
      state: {
        code: status === 403 ? 403 : status === 404 ? 404 : 500,
        title: status === 403 ? 'Access Denied' : status === 404 ? 'Transaction Not Found' : 'Failed to Load',
        message: status === 403
          ? "You don't have permission to view this transaction."
          : status === 404
          ? 'This transaction does not exist or has been removed.'
          : 'Unable to load transaction details. Please try again.',
      },
    });
    return null;
  }

  const statusCfg   = STATUS_CONFIG[batch.status] ?? STATUS_CONFIG.COMPLETED;
  const StatusIcon  = statusCfg.icon;
  const ModeIcon    = MODE_ICON[batch.paymentMode] ?? CreditCard;

  const memberAsAdmin = !member && !isMember ? staff.find((s) => String(s.id) === String(batch?.memberId)) : null;
  const memberName = isMember
    ? (myProfile?.fullName ?? myProfile?.name ?? user?.name ?? '—')
    : (member?.fullName ?? member?.name ?? memberAsAdmin?.fullName ?? memberAsAdmin?.username ?? '—');
  const memberPhone = isMember
    ? (myProfile?.phone ?? myProfile?.phoneNumber ?? null)
    : (member?.phone ?? member?.phoneNumber ?? null);
  const memberPhoneCountryCode = isMember ? myProfile?.phoneCountryCode : member?.phoneCountryCode;
  const chitName    = chit?.name ?? '—';
  const chitStatus  = chit?.status ?? null;

  const hasDues         = totalBalance != null && Number(totalBalance) > 0;
  const duesWithBalance = perChitBalances?.filter((b) => Number(b.totalOutstanding) > 0) ?? [];

  const receiptMemberName = memberName !== '—' ? memberName : (user?.name ?? '—');
  const receiptChitValue = chit?.chitValue ? '₹' + Number(chit.chitValue).toLocaleString('en-IN') : null;
  const receiptStartDate = chit?.startDate
    ? new Date(chit.startDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const receiptRows = [
    ['Date',         fmtDateTime(batch.collectedAt ?? batch.createdAt)],
    ['Payment Mode', batch.paymentMode === 'CREDIT' ? 'Credit Balance' : (batch.paymentMode?.replace(/_/g, ' ') ?? '—')],
    ['Member',       receiptMemberName],
    ['Chit Name',    chitName],
    ...(receiptChitValue ? [['Chit Value', receiptChitValue]] : []),
    ...(receiptStartDate ? [['Chit Start', receiptStartDate]] : []),
    ...(batch.allocations?.length > 0 ? [['Draw(s)', batch.allocations.map((a) => `Draw #${a.monthNumber}`).join(', ')]] : []),
    ...(batch.notes ? [['Notes', batch.notes]] : []),
  ];

  return (
    <>
    {/* ── Print-only receipt (hidden on screen, shown when printing) ── */}
    <div className="hidden print:block">
      <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", maxWidth: '420px', margin: '0 auto', padding: '40px 32px', color: '#111827' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '6px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="27" fill="none" viewBox="0 0 48 46"><path fill="#863bff" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/></svg>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#1E3A5F', letterSpacing: '-0.5px' }}>ChitWise</div>
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Official Payment Receipt</div>
        </div>
        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#6B7280', letterSpacing: '2px', textTransform: 'uppercase' }}>Receipt</div>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
        </div>
        {/* Amount hero */}
        <div style={{ textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '20px 16px', marginBottom: '24px', border: '1px solid #E5E7EB' }}>
          <div style={{ fontSize: '11px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Amount Paid</div>
          <div style={{ fontSize: '40px', fontWeight: '800', color: '#1E3A5F', lineHeight: 1 }}>
            ₹{Number(batch.totalAmount).toLocaleString('en-IN')}
          </div>
          <div style={{
            display: 'inline-block', marginTop: '10px', padding: '4px 14px', borderRadius: '20px',
            fontSize: '12px', fontWeight: '600',
            backgroundColor: batch.status === 'COMPLETED' ? '#DCFCE7' : '#FEF9C3',
            color: batch.status === 'COMPLETED' ? '#15803D' : '#92400E',
          }}>
            {STATUS_CONFIG[batch.status]?.label ?? batch.status}
          </div>
        </div>
        {/* Details table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '24px' }}>
          <tbody>
            {receiptRows.map(([label, value], i) => (
              <tr key={label} style={{ borderBottom: i < receiptRows.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <td style={{ padding: '9px 0', color: '#6B7280', width: '38%', verticalAlign: 'top' }}>{label}</td>
                <td style={{ padding: '9px 0', textAlign: 'right', fontWeight: '500', color: '#111827', verticalAlign: 'top' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Ref ID */}
        <div style={{ backgroundColor: '#F9FAFB', borderRadius: '8px', padding: '12px 14px', marginBottom: '28px', border: '1px solid #F3F4F6' }}>
          <div style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Transaction Reference</div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#374151', wordBreak: 'break-all' }}>{batch.id}</div>
        </div>
        {/* Footer */}
        <div style={{ textAlign: 'center', borderTop: '1px dashed #E5E7EB', paddingTop: '20px' }}>
          <div style={{ fontSize: '11px', color: '#9CA3AF' }}>This is a computer-generated receipt and does not require a signature.</div>
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#1E3A5F', marginTop: '10px' }}>ChitWise</div>
          <div style={{ fontSize: '10px', color: '#D1D5DB', marginTop: '2px' }}>Chit Fund Management Platform</div>
        </div>
      </div>
    </div>

    {/* ── Main page content (hidden when printing) ── */}
    <div className="print:hidden max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors flex-shrink-0"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900">Transaction Detail</h1>
          <CopyableId value={batch.id} />
        </div>
        {batch.status === 'COMPLETED' && (
          <button
            type="button"
            onClick={handlePrintReceipt}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors flex-shrink-0"
            title="Print / Save receipt"
          >
            <Printer size={16} className="text-gray-600" />
          </button>
        )}
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
          <StatusIcon size={12} />
          {statusCfg.label}
        </span>
      </div>

      {/* Cash Collected button — only for AWAITING_REMITTANCE, admin only */}
      {!isMember && batch.status === 'AWAITING_REMITTANCE' && (
        <div className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 ${statusCfg.bg} ${statusCfg.border}`}>
          <div>
            <p className="text-sm font-semibold text-amber-800">Awaiting Cash Collection</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Cash is with {resolveName(batch.collectedBy)}. Confirm receipt to settle the payment.
            </p>
          </div>
          <Button variant="success" onClick={() => setShowRemitConfirm(true)} loading={remitMutation.isPending}>
            <CheckCircle size={14} /> Cash Collected
          </Button>
        </div>
      )}

      {/* Credit payment banner */}
      {batch.paymentMode === 'CREDIT' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <CreditCard size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-700">Settled via Credit Balance</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              This payment was covered entirely from the member's credit balance — no cash was collected.
            </p>
          </div>
        </div>
      )}

      {/* Amount Hero */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total Amount</p>
          <p className="text-4xl font-bold text-gray-900">{h(batch.totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <Calendar size={11} />
            Recorded {fmtDateTime(batch.createdAt)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700">
          <ModeIcon size={14} className="text-gray-500" />
          {batch.paymentMode === 'CREDIT' ? 'Credit Balance' : batch.paymentMode?.replace('_', ' ')}
        </span>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Member */}
        <Card title={memberAsAdmin ? 'Member (Admin)' : 'Member'} icon={memberAsAdmin ? ShieldCheck : User}>
          <InfoRow
            icon={memberAsAdmin ? ShieldCheck : User}
            label="Name"
            value={
              memberAsAdmin ? (
                <span className="flex items-center gap-2 flex-wrap">
                  <span>{memberName}</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#EEF2F8] border border-[#C7D5E8] text-xs font-semibold text-[#1E3A5F]">
                    <ShieldCheck size={10} /> Admin
                  </span>
                </span>
              ) : memberName
            }
          />
          {memberPhone && (
            <InfoRow icon={Phone} label="Phone"
              value={memberPhoneCountryCode ? `${memberPhoneCountryCode} ${memberPhone}` : memberPhone} />
          )}
          {(member?.email ?? myProfile?.email ?? memberAsAdmin?.email) && (
            <InfoRow icon={Mail} label="Email" value={member?.email ?? myProfile?.email ?? memberAsAdmin?.email} />
          )}
          {(member?.city ?? myProfile?.city) && (
            <InfoRow icon={MapPin} label="City" value={member?.city ?? myProfile?.city} />
          )}
          {memberAsAdmin?.role && (
            <InfoRow icon={Hash} label="Role"
              value={memberAsAdmin.role.charAt(0).toUpperCase() + memberAsAdmin.role.slice(1).toLowerCase()} />
          )}
          {(member?.status ?? myProfile?.status) && (
            <InfoRow icon={Hash} label="Status" value={member?.status ?? myProfile?.status}
              valueClass={
                (member?.status ?? myProfile?.status) === 'ACTIVE'      ? 'text-green-600' :
                (member?.status ?? myProfile?.status) === 'BLACKLISTED' ? 'text-red-600'   : 'text-gray-500'
              } />
          )}
        </Card>

        {/* Chit */}
        <Card title="Chit Fund" icon={Layers}>
          <InfoRow icon={Layers} label="Name" value={chitName} />
          {batch.allocations && batch.allocations.length > 0 && (
            <InfoRow icon={Hash} label="Draw(s)" value={batch.allocations.map((a) => `#${a.monthNumber}`).join(', ')} />
          )}
          {chitStatus && (
            <InfoRow icon={Hash} label="Status" value={chitStatus}
              valueClass={
                chitStatus === 'ACTIVE'    ? 'text-green-600' :
                chitStatus === 'COMPLETED' ? 'text-[#1E3A5F]'  :
                chitStatus === 'PAUSED'    ? 'text-amber-600' : ''
              } />
          )}
          {chit?.chitValue && (
            <InfoRow icon={IndianRupee} label="Chit Value" value={h(chit.chitValue)} />
          )}
          {chit?.installmentAmount && (
            <InfoRow icon={Banknote} label="Monthly Installment" value={h(chit.installmentAmount)} />
          )}
          {chit?.durationMonths && (
            <InfoRow icon={CalendarDays} label="Duration"
              value={`${chit.durationMonths} months`} />
          )}
          {chit?.capacity != null && (() => {
            const orgCount = chit.orgHeldSpotsCount ?? 0;
            const enrolled = chit.enrolledCount ?? '—';
            const enrolledLabel = orgCount > 0
              ? `${enrolled} (${orgCount} org) enrolled / ${chit.capacity} total`
              : `${enrolled} enrolled / ${chit.capacity} total`;
            return <InfoRow icon={Users} label="Members" value={enrolledLabel} />;
          })()}
          {chit?.startDate && (
            <InfoRow icon={Calendar} label="Start Date" value={fmtDate(chit.startDate)} />
          )}
          {chit?.endDate && (
            <InfoRow icon={Calendar} label="End Date" value={fmtDate(chit.endDate)} />
          )}
        </Card>
      </div>

      {/* Member outstanding dues (cross-chit) — admin only */}
      {!isMember && hasDues && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-100 flex items-center gap-2 bg-amber-50">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-800">
              Member Outstanding: {h(totalBalance)} across all chits
            </h3>
          </div>
          <div className="px-5 divide-y divide-gray-100">
            {duesWithBalance.map((b) => (
              <div key={b.chitId} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{b.chitName}</span>
                  <span className="text-sm font-bold text-red-600">{h(b.totalOutstanding)}</span>
                </div>
                {b.months?.slice(0, 3).map((m) => (
                  <div key={m.monthNumber} className="flex justify-between text-xs text-gray-400 mt-1 pl-2">
                    <span>Draw {m.monthNumber}{m.dueDate ? ` · due ${new Date(m.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>
                    <span>{h(m.balance)}</span>
                  </div>
                ))}
                {b.months?.length > 3 && (
                  <p className="text-xs text-gray-400 mt-1 pl-2">+{b.months.length - 3} more months…</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Draw Allocations */}
      {batch.allocations && batch.allocations.length > 0 && (
        <Card title={`Draw Allocations — ${chitName}`} icon={Calendar}>
          <div className="py-2 space-y-0">
            {batch.allocations.map((alloc, idx) => {
              const draw = drawByMonth[alloc.monthNumber];
              const drawDate = draw?.drawDate ? new Date(draw.drawDate) : null;
              const monthLabel = drawDate
                ? `${MONTH_NAMES[drawDate.getMonth()]} ${drawDate.getFullYear()}`
                : null;
              return (
                <div key={idx} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#EEF2F8] flex items-center justify-center flex-shrink-0">
                      <Calendar size={13} style={{ color: '#1E3A5F' }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Draw #{alloc.monthNumber}</p>
                      {monthLabel && <p className="text-xs text-gray-400">{chitName} · {monthLabel}</p>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{h(alloc.allocatedAmount)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Collection Info */}
      <Card title="Collection" icon={Receipt}>
        {batch.recordedBy ? (() => {
          const admin = staff.find((s) => String(s.id) === String(batch.recordedBy));
          return (
            <>
              <InfoRow
                icon={ShieldCheck}
                label="Recorded By"
                value={
                  <span className="flex items-center gap-2 flex-wrap">
                    <span>{admin?.fullName ?? admin?.username ?? resolveName(batch.recordedBy)}</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#EEF2F8] border border-[#C7D5E8] text-xs font-semibold text-[#1E3A5F]">
                      <ShieldCheck size={10} /> Admin
                    </span>
                  </span>
                }
              />
              {admin?.role && (
                <InfoRow icon={Hash} label="Admin Role"
                  value={admin.role.charAt(0).toUpperCase() + admin.role.slice(1).toLowerCase()} />
              )}
              {admin?.email && <InfoRow icon={Mail} label="Admin Email" value={admin.email} />}
            </>
          );
        })() : (
          <InfoRow icon={User} label="Collected By" value={
            <span className="flex items-center gap-1.5">
              {resolveName(batch.collectedBy)}
              {roleMap[batch.collectedBy] && <RoleBadge role={roleMap[batch.collectedBy]} />}
            </span>
          } />
        )}
        <InfoRow icon={Clock} label={batch.collectedAt ? 'Collected At' : 'Recorded At'} value={fmtDateTime(batch.collectedAt ?? batch.createdAt)} />
      </Card>

      {/* Remittance Info (only if COMPLETED) */}
      {batch.status === 'COMPLETED' && batch.remittedBy && (
        <Card title="Remittance" icon={CheckCircle}>
          <InfoRow icon={User} label="Remitted By" value={resolveName(batch.remittedBy)} />
          <InfoRow icon={Clock} label="Remitted At" value={fmtDateTime(batch.remittedAt)} />
        </Card>
      )}

      {/* Void Info (only if VOIDED) */}
      {batch.status === 'VOIDED' && (
        <Card title="Void Details" icon={XCircle} className="border-red-200">
          <InfoRow icon={User} label="Voided By" value={resolveName(batch.voidedBy)} valueClass="text-red-700" />
          <InfoRow icon={Clock} label="Voided At" value={fmtDateTime(batch.voidedAt)} />
          {batch.voidReason && (
            <InfoRow icon={FileText} label="Void Reason" value={batch.voidReason} valueClass="text-red-700" />
          )}
        </Card>
      )}

      {/* Notes */}
      {batch.notes && (
        <Card title="Notes" icon={FileText}>
          <div className="py-4">
            <p className="text-sm text-gray-700 leading-relaxed">{resolveText(batch.notes)}</p>
          </div>
        </Card>
      )}

      {/* Void action — admin only */}
      {!isMember && (batch.status === 'COMPLETED' || batch.status === 'AWAITING_REMITTANCE') && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-red-800">Void Transaction</p>
              <p className="text-xs text-red-600 mt-0.5">
                Reverses all payment credits and updates treasury. This cannot be undone.
              </p>
            </div>
            {!showVoidForm && (
              <Button variant="danger" onClick={() => setShowVoidForm(true)}>
                <XCircle size={14} /> Void
              </Button>
            )}
          </div>
          {showVoidForm && (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Reason for voiding…"
                className="flex-1"
              />
              <Button
                variant="danger"
                disabled={!voidReason.trim() || voidMutation.isPending}
                loading={voidMutation.isPending}
                onClick={() => voidMutation.mutate()}
              >
                Confirm Void
              </Button>
              <Button variant="secondary" onClick={() => { setShowVoidForm(false); setVoidReason(''); }}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Confirm remit dialog */}
      {showRemitConfirm && (
        <ConfirmDialog
          variant="primary"
          title="Confirm Cash Received"
          description={`Confirm you received ${h(batch.totalAmount)} from ${resolveName(batch.collectedBy)}? This will settle the payment to the member's account.`}
          actionLabel="Cash Collected"
          loading={remitMutation.isPending}
          onConfirm={() => remitMutation.mutate()}
          onClose={() => setShowRemitConfirm(false)}
        />
      )}
    </div>
    </>
  );
}
