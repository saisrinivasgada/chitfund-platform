import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle, Clock, XCircle, Banknote, CreditCard, Building2,
  User, FileText, Calendar, Hash, Layers, AlertCircle, Receipt, AlertTriangle,
} from 'lucide-react';
import {
  getPaymentBatchById, getMember, getChit, listStaff, getDraws,
  getMembers, remitPayment,
  getMemberTotalBalance, getMemberBalance, getChitsForMember,
} from '../services/api';
import { useToastContext } from '../components/layout/AppLayout';
import Button from '../components/ui/Button';
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

  // Unified name lookup: staff first, then members (covers admin-as-staff, member UUIDs, etc.)
  const nameMap = Object.fromEntries([
    ...allMembers.map((m) => [m.id, m.fullName ?? m.name]),
    ...staff.map((s) => [s.id, s.fullName ?? s.username]),
  ]);

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

  const memberName  = member?.fullName ?? member?.name ?? '—';
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
          <p className="text-xs text-gray-400 font-mono truncate">{batch.id}</p>
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
              Cash is with {nameMap[batch.collectedBy] ?? 'collector'}. Confirm receipt to settle the payment.
            </p>
          </div>
          <Button variant="success" onClick={() => setShowRemitConfirm(true)} loading={remitMutation.isPending}>
            <CheckCircle size={14} /> Cash Collected
          </Button>
        </div>
      )}

      {/* Amount Hero */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total Amount</p>
          <p className="text-4xl font-bold text-gray-900">{fmtAmt(batch.totalAmount)}</p>
          <p className="text-xs text-gray-400 mt-1">{fmtDateTime(batch.createdAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
            <div className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700">
            <ModeIcon size={14} className="text-gray-500" />
            {batch.paymentMode}
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Member */}
        <Card title="Member" icon={User}>
          <InfoRow icon={User}    label="Name"  value={memberName} />
          {memberPhone && <InfoRow icon={Receipt} label="Phone" value={memberPhone} />}
        </Card>

        {/* Chit */}
        <Card title="Chit" icon={Layers}>
          <InfoRow icon={Layers} label="Chit Name" value={chitName} />
          {chitStatus && (
            <InfoRow icon={Hash} label="Status" value={chitStatus}
              valueClass={
                chitStatus === 'ACTIVE'    ? 'text-green-600' :
                chitStatus === 'COMPLETED' ? 'text-blue-600'  :
                chitStatus === 'PAUSED'    ? 'text-amber-600' : ''
              } />
          )}
          {chit?.installmentAmount && (
            <InfoRow icon={Banknote} label="Monthly Installment" value={fmtAmt(chit.installmentAmount)} />
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

      {/* FIFO Allocations */}
      {batch.allocations && batch.allocations.length > 0 && (
        <Card title="Month Allocations (FIFO)" icon={Calendar}>
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
                      <p className="text-sm font-medium text-gray-800">Month #{alloc.monthNumber}</p>
                      {monthLabel && <p className="text-xs text-gray-400">{monthLabel}</p>}
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
        <InfoRow
          icon={User}
          label="Collected By"
          value={nameMap[batch.collectedBy] ?? batch.collectedBy ?? '—'}
        />
        <InfoRow icon={Clock} label="Collected At" value={fmtDateTime(batch.collectedAt)} />
      </Card>

      {/* Remittance Info (only if COMPLETED) */}
      {batch.status === 'COMPLETED' && batch.remittedBy && (
        <Card title="Remittance" icon={CheckCircle}>
          <InfoRow
            icon={User}
            label="Remitted By"
            value={nameMap[batch.remittedBy] ?? batch.remittedBy ?? '—'}
          />
          <InfoRow icon={Clock} label="Remitted At" value={fmtDateTime(batch.remittedAt)} />
        </Card>
      )}

      {/* Void Info (only if VOIDED) */}
      {batch.status === 'VOIDED' && (
        <Card title="Void Details" icon={XCircle} className="border-red-200">
          <InfoRow
            icon={User}
            label="Voided By"
            value={nameMap[batch.voidedBy] ?? batch.voidedBy ?? '—'}
            valueClass="text-red-700"
          />
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
            <p className="text-sm text-gray-700 leading-relaxed">{batch.notes}</p>
          </div>
        </Card>
      )}

      {/* Confirm remit dialog */}
      {showRemitConfirm && (
        <ConfirmDialog
          variant="primary"
          title="Confirm Cash Received"
          description={`Confirm you received ${fmtAmt(batch.totalAmount)} from ${nameMap[batch.collectedBy] ?? 'the collector'}? This will settle the payment to the member's account.`}
          actionLabel="Cash Collected"
          loading={remitMutation.isPending}
          onConfirm={() => remitMutation.mutate()}
          onClose={() => setShowRemitConfirm(false)}
        />
      )}
    </div>
  );
}
