import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMembers, getMembersPage, createMember, getMemberBalanceBulk, getDeletedMembers, getMyTenantLimits, checkMemberPhoneTaken } from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import { formatPhone } from '../../components/ui/PhoneInput';
import PhoneOtpVerifier from '../../components/ui/PhoneOtpVerifier';
import { ListSkeleton } from '../../components/ui/Spinner';
import { Plus, Search, Users, Trash2, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlanLimitHandler } from '../../components/ui/PlanLimitModal';

const INITIAL_FORM = {
  fullName: '',
  phone: '',
  phoneCountryCode: '+91',
  email: '',
  address: '',
  city: '',
  aadhaarLast4: '',
  panNumber: '',
  notes: '',
  referredById: '',
};

function AddMemberModal({ onClose }) {
  const qc = useQueryClient();
  const toast = useToastContext();
  const { tenantPlan } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [fe, setFe] = useState({});
  const [phoneVerified, setPhoneVerified] = useState(false);
  const { handleError: handlePlanError, modal: planModal } = usePlanLimitHandler(tenantPlan);

  const { data: activeMembers = [] } = useQuery({
    queryKey: ['members', 'active-for-referral'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 500 }),
  });

  const mutation = useMutation({
    mutationFn: createMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      toast.success('Member added successfully');
      onClose();
    },
    onError: (err) => {
      if (handlePlanError(err)) return;
      const errors = err.response?.data?.fieldErrors;
      if (errors && Object.keys(errors).length > 0) { setFe(errors); return; }
      const code = err.response?.data?.errorCode;
      const msg  = err.response?.data?.message ?? '';
      if (code === 'MEMBER_006' || msg.toLowerCase().includes('phone')) { setFe({ phone: msg || 'A member with this phone number already exists.' }); return; }
      if (code === 'USER_003') { setFe({ email: 'This email is already in use by another account.' }); return; }
      toast.error(msg || 'Failed to add member');
    },
  });

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setFe((f) => ({ ...f, [key]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFe({});
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );
    mutation.mutate(payload);
  }

  return (
    <>
    {planModal}
    <Modal title="Add New Member" onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Personal Information</p>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full Name" required className="col-span-2" error={fe.fullName}>
            <Input
              placeholder="e.g. Sai Srinivas"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              required
            />
          </FormField>

          <div className="col-span-2">
            <PhoneOtpVerifier
              label="Phone *"
              phone={form.phone}
              countryCode={form.phoneCountryCode}
              originalPhone={null}
              onPhoneChange={(v) => { set('phone', v); setPhoneVerified(false); }}
              onCountryChange={(code) => set('phoneCountryCode', code)}
              onVerified={setPhoneVerified}
              onBeforeSend={async () => {
                const result = await checkMemberPhoneTaken({ phone: form.phone, countryCode: form.phoneCountryCode });
                if (result.taken) throw new Error('A member with this phone number already exists in your organisation.');
              }}
              fieldError={fe.phone}
              required
            />
          </div>

          <FormField label="Email" error={fe.email}>
            <Input
              type="email"
              placeholder="email@example.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </FormField>
          <FormField label="City" error={fe.city}>
            <Input
              placeholder="Hyderabad"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </FormField>
          <FormField label="Address" className="col-span-2" error={fe.address}>
            <Input
              placeholder="House/Flat, Street"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </FormField>
          <FormField label="Aadhaar Last 4 Digits" error={fe.aadhaarLast4}>
            <Input
              placeholder="1234"
              maxLength={4}
              value={form.aadhaarLast4}
              onChange={(e) => set('aadhaarLast4', e.target.value)}
            />
          </FormField>
          <FormField label="PAN Number" error={fe.panNumber}>
            <Input
              placeholder="ABCDE1234F"
              value={form.panNumber}
              onChange={(e) => set('panNumber', e.target.value.toUpperCase())}
            />
          </FormField>
        </div>

        <FormField label="Notes">
          <Textarea
            placeholder="Any additional notes…"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </FormField>

        <FormField label="Referred By">
          <Select
            value={form.referredById}
            onChange={(e) => set('referredById', e.target.value)}
          >
            <option value="">— No referral —</option>
            {[...activeMembers]
              .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} · {formatPhone(m.phoneCountryCode ?? '+91', m.phone)}
                </option>
              ))}
          </Select>
        </FormField>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={!!form.phone && !phoneVerified}
            className="flex-1"
            title={form.phone && !phoneVerified ? 'Verify the phone number first' : undefined}
          >
            Add Member
          </Button>
        </div>
      </form>
    </Modal>
    </>
  );
}

export default function MembersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, planExpiresAt } = useAuth();
  const { hidden, toggle: toggleHidden } = useHiddenAmounts();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canAddMembers = isAdmin || currentUser?.role === 'MANAGER';
  const isExpired = planExpiresAt && new Date(planExpiresAt) < new Date();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');

  useEffect(() => {
    if (location.state?.openAdd && canAddMembers) {
      setShowModal(true);
      window.history.replaceState({}, '');
    }
  }, [location.state, canAddMembers]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const isDeleted = statusFilter === 'DELETED';

  const { data: membersPage = { content: [], totalElements: 0, totalPages: 0 }, isLoading } = useQuery({
    queryKey: ['members', 'page', page, PAGE_SIZE, debouncedSearch, statusFilter],
    queryFn: () => getMembersPage({ page, size: PAGE_SIZE, search: debouncedSearch, status: isDeleted ? undefined : statusFilter }),
    keepPreviousData: true,
    enabled: !isDeleted,
  });

  const { data: deletedData = { content: [] }, isLoading: loadingDeleted } = useQuery({
    queryKey: ['members', 'deleted'],
    queryFn: () => getDeletedMembers({ size: 200 }),
    enabled: isDeleted && isAdmin,
  });

  const members = isDeleted ? [] : (membersPage.content ?? []);
  const totalElements = isDeleted ? 0 : (membersPage.totalElements ?? 0);
  const totalPages = isDeleted ? 0 : (membersPage.totalPages ?? 0);
  const deletedMembers = deletedData.content ?? [];

  const displayList = isDeleted ? deletedMembers.filter((m) => {
    const q = debouncedSearch.toLowerCase();
    return !q || (m.fullName ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q);
  }) : members;

  const isLoadingView = isDeleted ? loadingDeleted : isLoading;

  const { data: limits } = useQuery({
    queryKey: ['myTenantLimits'],
    queryFn: getMyTenantLimits,
    staleTime: 60_000,
    enabled: canAddMembers,
  });
  const maxMembers = limits?.maxMembers ?? -1;
  const isAtMemberLimit = maxMembers !== -1 && totalElements >= maxMembers;

  const memberIds = members.map((m) => m.id);
  const { data: balanceMap = {} } = useQuery({
    queryKey: ['memberBalancesBulk', memberIds],
    queryFn: () => getMemberBalanceBulk(memberIds),
    enabled: memberIds.length > 0 && !isDeleted,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            Members
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isDeleted ? displayList.length : totalElements} {statusFilter.toLowerCase()} members
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleHidden}
            title={hidden ? 'Show amounts' : 'Hide amounts'}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          {!isDeleted && canAddMembers && (
            <Button
              onClick={() => setShowModal(true)}
              disabled={isExpired || isAtMemberLimit}
              title={
                isExpired
                  ? 'Plan expired — renew to add members'
                  : isAtMemberLimit
                  ? `Member limit reached (${maxMembers} max on this plan)`
                  : undefined
              }
            >
              <Plus size={16} /> Add Member
            </Button>
          )}
          {!isDeleted && canAddMembers && isAtMemberLimit && !isExpired && (
            <span className="text-xs text-amber-600 font-medium">{totalElements}/{maxMembers} members</span>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Card header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: 'Active',    value: 'ACTIVE',    color: 'bg-green-50 text-green-700 border-green-300 ring-green-500' },
                { label: 'Inactive',  value: 'INACTIVE',  color: 'bg-gray-50 text-gray-600 border-gray-300 ring-gray-400' },
                { label: 'Blacklisted', value: 'BLACKLISTED', color: 'bg-red-100 text-red-800 border-red-400 ring-red-600' },
                ...(isAdmin ? [{ label: 'Deleted', value: 'DELETED', color: 'bg-rose-50 text-rose-500 border-rose-300 ring-rose-400' }] : []),
              ].map((pill) => (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => { setStatusFilter(pill.value); setPage(0); }}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer
                    ${statusFilter === pill.value
                      ? `${pill.color} ring-2 ring-offset-1 shadow-sm`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            <Input
              type="text"
              placeholder={`Search ${statusFilter.toLowerCase()} members…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56"
              iconLeft={<Search size={15} />}
            />
          </div>
        </div>

        {isLoadingView ? (
          <ListSkeleton rows={8} cols={5} />
        ) : displayList.length === 0 ? (
          <EmptyState
            icon={isDeleted ? Trash2 : Users}
            title={isDeleted ? 'No deleted members' : `No ${statusFilter.toLowerCase()} members`}
            message={
              isDeleted ? 'No members have been deleted.' :
              search ? 'Try a different search term.' :
              statusFilter === 'ACTIVE' ? 'Add your first member to get started.' :
              `No members with ${statusFilter.toLowerCase()} status.`
            }
            action={!search && statusFilter === 'ACTIVE' && !isExpired ? 'Add Member' : undefined}
            onAction={!search && statusFilter === 'ACTIVE' && !isExpired ? () => setShowModal(true) : undefined}
          />
        ) : (
          <Table columns={isDeleted
            ? ['Member', 'Phone', 'City', 'Deleted At', 'Status']
            : ['Member', 'Phone', 'Email', 'City', 'Outstanding', 'Status']
          }>
            {displayList.map((m) => {
              const outstanding = Number(balanceMap[m.id] ?? 0);
              const hasBalance = outstanding > 0;
              return (
                <Tr key={m.id} className={isDeleted ? 'opacity-60' : ''} onClick={() => navigate(`/members/${m.id}`)}>
                  <Td className="font-medium text-gray-900">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: isDeleted ? '#9CA3AF' : '#1E3A5F' }}
                      >
                        {(m.fullName ?? m.name ?? '?')[0].toUpperCase()}
                      </div>
                      <span className={isDeleted ? 'line-through text-gray-500' : ''}>{m.fullName ?? m.name}</span>
                    </div>
                  </Td>
                  <Td>{m.phone ? formatPhone(m.phoneCountryCode ?? '+91', m.phone) : <span className="text-xs text-gray-300 italic">—</span>}</Td>
                  {isDeleted ? (
                    <Td>{m.city ?? <span className="text-xs text-gray-300 italic">—</span>}</Td>
                  ) : (
                    <Td>{m.email ?? <span className="text-xs text-gray-300 italic">—</span>}</Td>
                  )}
                  <Td>{isDeleted
                    ? (m.deletedAt ? new Date(m.deletedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—')
                    : (m.city ?? <span className="text-xs text-gray-300 italic">—</span>)
                  }</Td>
                  {!isDeleted && (
                    <Td>
                      <div className="flex items-center gap-2">
                        {!hidden && (
                          <span className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: hasBalance ? '#DC2626' : '#16A34A' }} />
                        )}
                        {hidden ? (
                          <span className="text-sm font-medium text-gray-400 tracking-widest">••••••</span>
                        ) : hasBalance ? (
                          <span className="text-sm font-medium text-red-600">₹{outstanding.toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-sm text-gray-400">Clear</span>
                        )}
                      </div>
                    </Td>
                  )}
                  <Td>
                    <Badge variant={isDeleted ? 'danger' : statusBadge(m.status ?? 'ACTIVE')}>
                      {isDeleted ? 'Deleted' : (m.status ?? 'ACTIVE')}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}

        {/* Pagination */}
        {!isDeleted && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages} &middot; {totalElements} members
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && <AddMemberModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
