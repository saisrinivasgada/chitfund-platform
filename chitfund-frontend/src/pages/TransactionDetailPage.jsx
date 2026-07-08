import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle, Clock, XCircle, Banknote, CreditCard, Building2,
  User, FileText, Calendar, Hash, Layers, AlertCircle, Receipt, AlertTriangle,
  Mail, MapPin, Phone, Copy, Check, IndianRupee, Users, CalendarDays, ShieldCheck,
} from 'lucide-react';
import {
  getPaymentBatchById, getMember, getChit, listStaff, getDraws,
  getMembers, remitPayment, voidPaymentBatch,
  getMemberTotalBalance, getMemberBalance, getChitsForMember,
} from '../services/api';
import { useToastContext } from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/FormField';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const STATUS_CONFIG = {
  COMPLETED:           { label: 'Completed',           icon: CheckCircle, bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200', dot: 'bg-green-500' },
  AWAITING_REMITTANCE: { label: 'Awaiting Remittance', icon: Clock,       bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500' },
  VOIDED:              { label: 'Voided',               icon: XCircle,     bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',   dot: 'bg-red-500' },
};

const MODE_ICON = {
  CASH: Banknote,
  UPI:  CreditCard,
  BANK: Building2, NEFT: Building2, RTGS: Building2, IMPS: Building2,
  BANK_TRANSFER: Building2,
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtAmt(v) { return '₹' + Number(v ?? 0).toLocaleString('en-IN'); }
function fmtDateTime(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const [showRemitConfirm, setShowRemitConfirm] = useState(false);
  const [showVoidForm,    setShowVoidForm]    = useState(false);
  const [voidReason,      setVoidReason]      = useState('');

  const { data: batch, isLoading, isError } = useQuery({
    queryKey: ['batch', batchId],
    queryFn:  () => getPaymentBatchById(batchId),
    enabled:  !!batchId,
  });

  const { data: member } = useQuery({
    queryKey: ['member', batch?.memberId],
    queryFn:  () => getMember(batch.memberId),
    enabled:  !!batch?.memberId,
  });

  const { data: chit } = useQuery({
    queryKey: ['chit', batch?.chitId],
    queryFn:  () => getChit(batch.chitId),
    enabled:  !!batch?.chitId,
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff'],
    queryFn:  listStaff,
    staleTime: 120_000,
  });

  // Build a combined name map: staff + all members — resolves any UUID in collectedBy/remittedBy
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn:  getMembers,
    staleTime: 120_000,
  });

  const { data: draws = [] } = useQuery({
    queryKey: ['draws', batch?.chitId],
    queryFn:  () => getDraws(batch.chitId),
    enabled:  !!batch?.chitId,
    staleTime: 60_000,
  });

  // Member outstanding dues (cross-chit)
  const { data: totalBalance } = useQuery({
    queryKey: ['memberTotalBalance', batch?.memberId],
    queryFn:  () => getMemberTotalBalance(batch.memberId),
    enabled:  !!batch?.memberId,
    staleTime: 30_000,
  });
  const { data: memberChits = [] } = useQuery({
    queryKey: ['memberChits', batch?.memberId],
    queryFn:  () => getChitsForMember(batch.memberId),
    enabled:  !!batch?.memberId,
    staleTime: 30_000,
  });
  const { data: perChitBalances } = useQuery({
    queryKey: ['memberBalancesAllChits', batch?.memberId, memberChits.map(c => c.id).join(',')],
    queryFn:  async () => {
      const results = await Promise.all(
        memberChits.map((c) => getMemberBalance({ memberId: batch.memberId, chitId: c.id }))
      );
      return results.map((b, i) => ({ ...b, chitName: memberChits[i].name, chitId: memberChits[i].id }));
    },
    enabled: memberChits.length > 0 && !!batch?.memberId,
    staleTime: 30_000,
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

  if (isError || !batch) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-gray-500">Transaction not found or failed to load.</p>
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 underline cursor-pointer">Go back</button>
      </div>
    );
  }

  const statusCfg   = STATUS_CONFIG[batch.status] ?? STATUS_CONFIG.COMPLETED;
  const StatusIcon  = statusCfg.icon;
  const ModeIcon    = MODE_ICON[batch.paymentMode] ?? CreditCard;

  const memberAsAdmin = !member ? staff.find((s) => String(s.id) === String(batch?.memberId)) : null;
  const memberName  = member?.fullName ?? member?.name ?? memberAsAdmin?.fullName ?? memberAsAdmin?.username ?? '—';
  const memberPhone = member?.phone ?? member?.phoneNumber ?? null;
  const chitName    = chit?.name ?? '—';
  const chitStatus  = chit?.status ?? null;

  const hasDues         = totalBalance != null && Number(totalBalance) > 0;
  const duesWithBalance = perChitBalances?.filter((b) => Number(b.totalOutstanding) > 0) ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
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
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
          <StatusIcon size={12} />
          {statusCfg.label}
        </span>
      </div>

      {/* Cash Collected button — only for AWAITING_REMITTANCE */}
      {batch.status === 'AWAITING_REMITTANCE' && (
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

      {/* Void action — for COMPLETED and AWAITING_REMITTANCE batches */}
      {(batch.status === 'COMPLETED' || batch.status === 'AWAITING_REMITTANCE') && (
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

      {/* Amount Hero */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total Amount</p>
          <p className="text-4xl font-bold text-gray-900">{fmtAmt(batch.totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
            <Calendar size={11} />
            Recorded {fmtDateTime(batch.createdAt)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700">
          <ModeIcon size={14} className="text-gray-500" />
          {batch.paymentMode?.replace('_', ' ')}
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
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700">
                    <ShieldCheck size={10} /> Admin
                  </span>
                </span>
              ) : memberName
            }
          />
          {memberPhone && (
            <InfoRow icon={Phone} label="Phone"
              value={member?.phoneCountryCode ? `${member.phoneCountryCode} ${memberPhone}` : memberPhone} />
          )}
          {(member?.email ?? memberAsAdmin?.email) && (
            <InfoRow icon={Mail} label="Email" value={member?.email ?? memberAsAdmin?.email} />
          )}
          {member?.city && <InfoRow icon={MapPin} label="City" value={member.city} />}
          {memberAsAdmin?.role && (
            <InfoRow icon={Hash} label="Role"
              value={memberAsAdmin.role.charAt(0).toUpperCase() + memberAsAdmin.role.slice(1).toLowerCase()} />
          )}
          {member?.status && (
            <InfoRow icon={Hash} label="Status" value={member.status}
              valueClass={
                member.status === 'ACTIVE'      ? 'text-green-600' :
                member.status === 'BLACKLISTED' ? 'text-red-600'   : 'text-gray-500'
              } />
          )}
        </Card>

        {/* Chit */}
        <Card title="Chit Fund" icon={Layers}>
          <InfoRow icon={Layers} label="Name" value={chitName} />
          {chitStatus && (
            <InfoRow icon={Hash} label="Status" value={chitStatus}
              valueClass={
                chitStatus === 'ACTIVE'    ? 'text-green-600' :
                chitStatus === 'COMPLETED' ? 'text-blue-600'  :
                chitStatus === 'PAUSED'    ? 'text-amber-600' : ''
              } />
          )}
          {chit?.chitValue && (
            <InfoRow icon={IndianRupee} label="Chit Value" value={fmtAmt(chit.chitValue)} />
          )}
          {chit?.installmentAmount && (
            <InfoRow icon={Banknote} label="Monthly Installment" value={fmtAmt(chit.installmentAmount)} />
          )}
          {chit?.durationMonths && (
            <InfoRow icon={CalendarDays} label="Duration"
              value={`${chit.durationMonths} months`} />
          )}
          {chit?.totalMembers != null && (
            <InfoRow icon={Users} label="Members"
              value={`${chit.enrolledCount ?? '—'} enrolled / ${chit.totalMembers} total`} />
          )}
          {chit?.startDate && (
            <InfoRow icon={Calendar} label="Start Date" value={fmtDate(chit.startDate)} />
          )}
          {chit?.endDate && (
            <InfoRow icon={Calendar} label="End Date" value={fmtDate(chit.endDate)} />
          )}
        </Card>
      </div>

      {/* Member outstanding dues (cross-chit) */}
      {hasDues && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-100 flex items-center gap-2 bg-amber-50">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-800">
              Member Outstanding: {fmtAmt(totalBalance)} across all chits
            </h3>
          </div>
          <div className="px-5 divide-y divide-gray-100">
            {duesWithBalance.map((b) => (
              <div key={b.chitId} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{b.chitName}</span>
                  <span className="text-sm font-bold text-red-600">{fmtAmt(b.totalOutstanding)}</span>
                </div>
                {b.months?.slice(0, 3).map((m) => (
                  <div key={m.monthNumber} className="flex justify-between text-xs text-gray-400 mt-1 pl-2">
                    <span>Month {m.monthNumber}{m.dueDate ? ` · due ${new Date(m.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>
                    <span>{fmtAmt(m.balance)}</span>
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
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Calendar size={13} className="text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Draw #{alloc.monthNumber}</p>
                      {monthLabel && <p className="text-xs text-gray-400">{chitName} · {monthLabel}</p>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{fmtAmt(alloc.allocatedAmount)}</span>
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
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-semibold text-indigo-700">
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
          <InfoRow icon={User} label="Collected By" value={resolveName(batch.collectedBy)} />
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

      {/* Confirm remit dialog */}
      {showRemitConfirm && (
        <ConfirmDialog
          variant="primary"
          title="Confirm Cash Received"
          description={`Confirm you received ${fmtAmt(batch.totalAmount)} from ${resolveName(batch.collectedBy)}? This will settle the payment to the member's account.`}
          actionLabel="Cash Collected"
          loading={remitMutation.isPending}
          onConfirm={() => remitMutation.mutate()}
          onClose={() => setShowRemitConfirm(false)}
        />
      )}
    </div>
  );
}
