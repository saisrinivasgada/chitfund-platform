import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getChits, getDraws, closeDraw, skipDraw, deleteDraw,
  getWinners, getPayoutsByChit, listStaff, getMembers,
  getEnrollments,
} from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import FormField, { Input } from '../../components/ui/FormField';
import { PageSpinner } from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { ConfirmDialog, DestructiveDialog } from '../../components/ui/ConfirmDialog';
import OpenDrawModal, { computeDefaultDueDate } from '../../components/draws/OpenDrawModal';
import OpenAuctionModal from '../../components/draws/OpenAuctionModal';
import { listAuctions } from '../../services/api';
import {
  Shuffle, BookOpen, Trophy, CheckCircle, XCircle, Clock,
  Plus, AlertTriangle, ChevronDown, ChevronRight, Calendar,
  ExternalLink, Gavel,
} from 'lucide-react';


// ─── Skip Draw Modal ───────────────────────────────────────────────────────────
function SkipDrawModal({ chit, chitId, draws, onClose }) {
  const qc    = useQueryClient();
  const toast = useToastContext();
  const nextNum = draws.length > 0 ? Math.max(...draws.map((d) => d.monthNumber)) + 1 : 1;

  const [form, setForm] = useState({
    monthNumber: nextNum,
    dueDate: computeDefaultDueDate(chit?.startDate, nextNum),
    skipReason: '',
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', chitId],
    queryFn: () => getEnrollments(chitId),
  });

  const mutation = useMutation({
    mutationFn: () => skipDraw({
      chitId,
      monthNumber: form.monthNumber,
      dueDate: form.dueDate,
      installmentAmount: Number(chit?.installmentAmount ?? 0),
      maxCycles: chit?.capacity ?? nextNum,
      skipReason: form.skipReason,
      members: [...new Set(enrollments.map((e) => e.memberId ?? e.id))].map((id) => ({
        memberId: id, amountDue: Number(chit?.installmentAmount ?? 0),
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      toast.success('Draw skipped — schedule shifted forward by 1 month');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to skip draw'),
  });

  return (
    <Modal title="Skip Draw" onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-amber-200 bg-amber-50">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Skipping a draw waives all {[...new Set(enrollments.map((e) => e.memberId ?? e.id))].length} member payments for that month and shifts the schedule forward by 1 month.
          </p>
        </div>
        <FormField label="Draw Number" required>
          <Input
            type="number"
            min="1"
            value={form.monthNumber}
            onChange={(e) => setForm((f) => ({
              ...f,
              monthNumber: Number(e.target.value),
              dueDate: computeDefaultDueDate(chit?.startDate, Number(e.target.value)),
            }))}
          />
        </FormField>
        <FormField label="Due Date">
          <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </FormField>
        <FormField label="Reason (optional)">
          <Input
            value={form.skipReason}
            onChange={(e) => setForm((f) => ({ ...f, skipReason: e.target.value }))}
            placeholder="e.g. Public holiday, festival…"
          />
        </FormField>
        <div className="flex gap-3 pt-1">
          <Button variant="muted" size="md" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="warning" size="md" className="flex-1"
            loading={mutation.isPending}
            disabled={!form.monthNumber}
            onClick={() => mutation.mutate()}
          >
            Skip Draw {form.monthNumber}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Draw Cards Panel ──────────────────────────────────────────────────────────
function DrawsPanel({ chit, chitId, isAdmin }) {
  const qc      = useQueryClient();
  const toast   = useToastContext();
  const navigate = useNavigate();
  const { planExpiresAt } = useAuth();
  const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date();

  const [showOpenModal,   setShowOpenModal]  = useState(false);
  const [showSkipModal,   setShowSkipModal]  = useState(false);
  const [pendingClose,    setPendingClose]   = useState(null);
  const [pendingDelete,   setPendingDelete]  = useState(null);
  const [expanded,        setExpanded]       = useState(null);
  const [openAuctionDraw, setOpenAuctionDraw] = useState(null); // draw object for which to open auction

  const { data: draws = [],      isLoading } = useQuery({ queryKey: ['draws', chitId],       queryFn: () => getDraws(chitId) });
  const { data: winners = [] }               = useQuery({ queryKey: ['winners', chitId],     queryFn: () => getWinners(chitId) });
  const isAuctionChit = chit?.winnerSelectionMode === 'AUCTION' || chit?.chitType === 'AUCTION';
  const { data: auctions = [] } = useQuery({
    queryKey: ['auctions', chitId],
    queryFn: () => listAuctions(chitId),
    enabled: isAuctionChit,
  });
  const auctionByMonth = Object.fromEntries(auctions.map((a) => [a.monthNumber, a]));
  const { data: chitPayouts = [] }           = useQuery({ queryKey: ['chit-payouts', chitId], queryFn: () => getPayoutsByChit(chitId) });
  const { data: staffList = [] }             = useQuery({ queryKey: ['staff'],               queryFn: listStaff });
  const { data: allMembers = [] }            = useQuery({ queryKey: ['members'],              queryFn: getMembers });

  const memberMap = Object.fromEntries([
    ...staffList.map((s)  => [String(s.id), s.fullName ?? s.username ?? '—']),
    ...allMembers.map((m) => [String(m.id), m.fullName ?? m.name ?? '—']),
  ]);
  const payoutsByMonth = chitPayouts.reduce((acc, p) => {
    acc[p.monthNumber] = acc[p.monthNumber] ? [...acc[p.monthNumber], p] : [p];
    return acc;
  }, {});

  const closeMutation = useMutation({
    mutationFn: (drawId) => closeDraw(drawId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      toast.success('Draw closed');
      setPendingClose(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to close draw'),
  });

  const deleteMutation = useMutation({
    mutationFn: (drawId) => deleteDraw(drawId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['draws', chitId] });
      qc.invalidateQueries({ queryKey: ['winners', chitId] });
      toast.success('Draw deleted');
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? 'Failed to delete draw'),
  });

  const today = new Date();
  const totalSlots  = chit?.capacity ?? 0;
  const realDraws   = draws.filter((d) => d.status !== 'SKIPPED').length;
  const skipped     = draws.filter((d) => d.status === 'SKIPPED').length;
  const allUsed     = totalSlots > 0 && realDraws >= totalSlots;
  const isActive    = chit?.status === 'ACTIVE';

  return (
    <div className="space-y-4">
      {/* Panel header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Merriweather, serif' }}>
            {chit.name}
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {realDraws} / {totalSlots} draws
            {skipped > 0 && <span className="text-gray-400"> · {skipped} skipped</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/chits/${chitId}?tab=draws`)}
            className="flex items-center gap-1.5 text-xs text-[#1E3A5F] font-medium hover:underline cursor-pointer"
          >
            Full Detail <ExternalLink size={12} />
          </button>
          {isAdmin && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowSkipModal(true)} disabled={!isActive || isExpired}>
                <XCircle size={13} /> Skip
              </Button>
              <Button
                size="sm"
                onClick={() => setShowOpenModal(true)}
                disabled={allUsed || !isActive || isExpired}
                title={isExpired ? 'Plan expired — renew to open draws' : !isActive ? `Chit must be Active (current: ${chit.status})` : allUsed ? 'All draws opened' : undefined}
              >
                <Plus size={13} /> Open Draw
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Draw cards */}
      {isLoading ? (
        <PageSpinner />
      ) : draws.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <EmptyState
            icon={Calendar}
            title="No draws yet"
            message={isActive ? 'Open the first draw to start collecting payments.' : `Chit must be Active to open draws (current: ${chit.status ?? 'DRAFT'}).`}
            action={isAdmin && isActive ? 'Open Draw' : undefined}
            onAction={isAdmin && isActive ? () => setShowOpenModal(true) : undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {draws.map((d) => {
            const totalDue    = Number(d.totalOutstanding ?? 0) + Number(d.totalCollected ?? 0);
            const collected   = Number(d.totalCollected ?? 0);
            const pct         = totalDue > 0 ? Math.min(100, Math.round((collected / totalDue) * 100)) : 0;
            const dueDate     = d.dueDate ? new Date(d.dueDate) : null;
            const isOverdue   = d.status === 'OPEN' && (d.outstandingCount ?? 0) > 0 && dueDate && dueDate < today;
            const isExp       = expanded === d.id;
            const drawWinners = winners.filter((w) => w.monthNumber === d.monthNumber);
            const monthPayouts = payoutsByMonth[d.monthNumber] ?? [];
            const isDone      = d.status === 'CLOSED' || d.status === 'SKIPPED';
            const isCompleted = isDone && monthPayouts.length > 0 && monthPayouts.every((p) => p.status === 'DISBURSED');

            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <button
                      className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpanded(isExp ? null : d.id)}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: '#1E3A5F' }}
                      >
                        {d.monthNumber}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">Draw {d.monthNumber}</span>
                          {isCompleted
                            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
                                <CheckCircle size={10} /> Completed
                              </span>
                            : <Badge variant={statusBadge(d.status ?? 'OPEN')}>{d.status ?? 'OPEN'}</Badge>
                          }
                          {monthPayouts.map((p) => p.status === 'DISBURSED' ? (
                            <span key={p.id} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                              <CheckCircle size={10} /> Disbursed ₹{Number(p.netPayoutAmount).toLocaleString('en-IN')}
                            </span>
                          ) : p.status === 'PENDING' || p.status === 'PARTIALLY_DISBURSED' ? (
                            <span key={p.id} className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                              <Clock size={10} /> {p.status === 'PARTIALLY_DISBURSED' ? 'Partial' : 'Pending'} ₹{Number(p.netPayoutAmount).toLocaleString('en-IN')}
                            </span>
                          ) : null)}
                          {drawWinners.map((w) => {
                            const wName = memberMap[String(w.memberId ?? w.winnerId)] ?? '—';
                            return (
                              <span key={w.id} className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                                <Trophy size={10} /> {wName}
                              </span>
                            );
                          })}
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              <AlertTriangle size={11} /> Overdue
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {dueDate ? dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          {d.installmentAmount ? ` · ₹${Number(d.installmentAmount).toLocaleString('en-IN')} / member` : ''}
                        </p>
                      </div>
                      <ChevronDown size={15} className={`text-gray-400 flex-shrink-0 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                    </button>

                    <div className="flex gap-2 flex-shrink-0 flex-wrap">
                      {/* Open Auction button — shown for AWAITING_AUCTION draws with no session yet */}
                      {isAdmin && isAuctionChit && d.status === 'AWAITING_AUCTION' && !auctionByMonth[d.monthNumber] && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setOpenAuctionDraw(d)}
                        >
                          <Gavel size={13} /> Open Auction
                        </Button>
                      )}
                      {/* Auction room button — shown when an auction session exists */}
                      {isAuctionChit && auctionByMonth[d.monthNumber] && (
                        <Button
                          size="sm"
                          variant={auctionByMonth[d.monthNumber].status === 'OPEN' ? 'primary' : 'secondary'}
                          onClick={() => navigate(`/chits/${chitId}/auction/${auctionByMonth[d.monthNumber].id}`)}
                        >
                          <Gavel size={13} />
                          {auctionByMonth[d.monthNumber].status === 'OPEN' ? 'Live Auction' : 'View Auction'}
                        </Button>
                      )}
                      {isAdmin && (d.status === 'OPEN' || d.status === 'AWAITING_AUCTION') && (
                        <>
                          <Button
                            variant="danger" size="sm"
                            onClick={() => setPendingDelete({ drawId: d.id, monthNumber: d.monthNumber })}
                          >
                            Delete
                          </Button>
                          {d.status === 'OPEN' && (
                            <Button
                              variant="secondary" size="sm"
                              loading={closeMutation.isPending}
                              onClick={() => setPendingClose({ drawId: d.id, outstandingCount: d.outstandingCount ?? 0 })}
                            >
                              <CheckCircle size={13} /> Close
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Collection Progress</span>
                      <span className="font-medium">
                        {pct}% · ₹{collected.toLocaleString('en-IN')} of ₹{totalDue.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct === 100 ? '#16A34A' : isOverdue ? '#DC2626' : '#1E3A5F',
                        }}
                      />
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Settled',     count: d.settledCount,       color: 'text-green-700', bg: 'bg-green-50'  },
                      { label: 'Partial',     count: d.partiallyPaidCount, color: 'text-amber-600', bg: 'bg-amber-50'  },
                      { label: 'Outstanding', count: d.outstandingCount,   color: isOverdue ? 'text-red-600' : 'text-gray-700', bg: isOverdue ? 'bg-red-50' : 'bg-gray-50' },
                      { label: 'Waived',      count: d.waivedCount,        color: 'text-gray-400',  bg: 'bg-gray-50'   },
                    ].map(({ label, count, color, bg }) => (
                      <div key={label} className={`text-center ${bg} rounded-lg py-2`}>
                        <p className={`text-base font-bold ${color}`}>{count ?? 0}</p>
                        <p className="text-xs text-gray-400">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expanded: collect payments link */}
                {isExp && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                    <button
                      onClick={() => navigate(`/chits/${chitId}?tab=draws`)}
                      className="flex items-center gap-2 text-sm text-[#1E3A5F] font-medium hover:underline cursor-pointer"
                    >
                      <ExternalLink size={14} />
                      Go to Chit Detail to collect payments for Draw {d.monthNumber}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showOpenModal && (
        <OpenDrawModal
          chit={chit}
          chitId={chitId}
          draws={draws}
          onClose={() => setShowOpenModal(false)}
        />
      )}
      {openAuctionDraw && (
        <OpenAuctionModal
          chitId={chitId}
          chit={chit}
          draw={openAuctionDraw}
          onClose={() => setOpenAuctionDraw(null)}
        />
      )}
      {showSkipModal && (
        <SkipDrawModal
          chit={chit}
          chitId={chitId}
          draws={draws}
          onClose={() => setShowSkipModal(false)}
        />
      )}
      {pendingClose && (
        <ConfirmDialog
          variant={pendingClose.outstandingCount > 0 ? 'warning' : 'primary'}
          title="Close Draw?"
          message={
            pendingClose.outstandingCount > 0
              ? `${pendingClose.outstandingCount} member${pendingClose.outstandingCount > 1 ? 's have' : ' has'} outstanding payments. Close anyway?`
              : 'Mark this draw as closed. This cannot be undone.'
          }
          confirmLabel="Close Draw"
          onConfirm={() => closeMutation.mutate(pendingClose.drawId)}
          onCancel={() => setPendingClose(null)}
          loading={closeMutation.isPending}
        />
      )}
      {pendingDelete && (
        <DestructiveDialog
          title={`Delete Draw ${pendingDelete.monthNumber}?`}
          message="This will remove the draw record. Winner records and payouts must be handled separately via the Chit Detail page."
          confirmLabel="Delete Draw"
          onConfirm={() => deleteMutation.mutate(pendingDelete.drawId)}
          onCancel={() => setPendingDelete(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function DrawsPage() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [selectedChitId, setSelectedChitId] = useState(null);

  const { data: chits = [], isLoading } = useQuery({
    queryKey: ['chits'],
    queryFn: getChits,
  });
  useQuery({
    queryKey: ['draws-latest'],
    queryFn: async () => {
      const ids = chits.filter((c) => c.status === 'ACTIVE').map((c) => c.id);
      return ids;
    },
    enabled: chits.length > 0,
  });

  const activeChits = chits.filter((c) => c.status === 'ACTIVE');
  const selectedChit = chits.find((c) => c.id === selectedChitId) ?? null;

  if (isLoading) return <PageSpinner />;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          Draws
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin ? 'Open and manage draw sessions for active chit funds. All actions are audited.' : 'View draw results for active chit funds.'}
        </p>
      </div>

      {activeChits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <EmptyState
            icon={Shuffle}
            title="No active chits"
            message="Activate a chit fund first to manage draws."
          />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Left: Chit selector */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Active Chits</p>
            {activeChits.map((c) => {
              const isSelected = c.id === selectedChitId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedChitId(c.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#1E3A5F] bg-[#EFF4FA] shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: isSelected ? '#1E3A5F' : '#1E3A5F18' }}
                      >
                        <BookOpen size={15} style={{ color: isSelected ? '#fff' : '#1E3A5F' }} />
                      </div>
                      <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                    </div>
                    {isSelected && <ChevronRight size={14} className="text-[#1E3A5F] flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-400 ml-10">
                    ₹{(c.installmentAmount ?? 0).toLocaleString('en-IN')} · {c.capacity} members
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right: Draw panel */}
          <div className="flex-1 min-w-0">
            {!selectedChit ? (
              <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-gray-200 border-dashed text-center px-8">
                <Shuffle size={32} className="text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500">Select a chit to manage draws</p>
                <p className="text-xs text-gray-400 mt-1">
                  {activeChits.length} active chit{activeChits.length !== 1 ? 's' : ''} available
                </p>
              </div>
            ) : (
              <DrawsPanel
                key={selectedChitId}
                chit={selectedChit}
                chitId={selectedChitId}
                isAdmin={isAdmin}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
