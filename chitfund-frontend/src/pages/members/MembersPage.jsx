import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMembers, createMember, getMemberBalanceBulk, getDeletedMembers } from '../../services/api';
import { useToastContext } from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import { useHiddenAmounts } from '../../hooks/useHiddenAmounts';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Badge, { statusBadge } from '../../components/ui/Badge';
import Table, { Tr, Td } from '../../components/ui/Table';
import EmptyState from '../../components/ui/EmptyState';
import FormField, { Input, Select, Textarea } from '../../components/ui/FormField';
import PhoneInput, { formatPhone } from '../../components/ui/PhoneInput';
import { PageSpinner } from '../../components/ui/Spinner';
import { Plus, Search, Users, Trash2, Eye, EyeOff } from 'lucide-react';

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
  const [form, setForm] = useState(INITIAL_FORM);

  const { data: activeMembers = [] } = useQuery({
    queryKey: ['members', 'active-for-referral'],
    queryFn: () => getMembers({ status: 'ACTIVE', size: 500 }),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: createMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      toast.success('Member added successfully');
      onClose();
    },
    onError: (err) => {
      const fieldErrors = err.response?.data?.fieldErrors;
      if (fieldErrors) {
        const firstError = Object.values(fieldErrors)[0];
        toast.error(firstError ?? 'Request validation failed');
      } else {
        toast.error(err.response?.data?.message ?? 'Failed to add member');
      }
    },
  });

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
    );
    mutation.mutate(payload);
  }

  return (
    <Modal title="Add New Member" onClose={onClose} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Personal Information</p>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Full Name" required className="col-span-2">
            <Input
              placeholder="e.g. Ravi Kumar"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              required
            />
          </FormField>

          <div className="col-span-2">
            <PhoneInput
              label="Phone *"
              countryCode={form.phoneCountryCode}
              phone={form.phone}
              onCountryChange={(code) => set('phoneCountryCode', code)}
              onPhoneChange={(v) => set('phone', v)}
              required
            />
          </div>

          <FormField label="Email">
            <Input
              type="email"
              placeholder="email@example.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </FormField>
          <FormField label="City">
            <Input
              placeholder="Hyderabad"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </FormField>
          <FormField label="Address" className="col-span-2">
            <Input
              placeholder="House/Flat, Street"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </FormField>
          <FormField label="Aadhaar Last 4 Digits">
            <Input
              placeholder="1234"
              maxLength={4}
              value={form.aadhaarLast4}
              onChange={(e) => set('aadhaarLast4', e.target.value)}
            />
          </FormField>
          <FormField label="PAN Number">
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
              .sort((a, b) => a.fullName.localeCompare(b.fullName))
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
          <Button type="submit" loading={mutation.isPending} className="flex-1">
            Add Member
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function MembersPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { hidden, toggle: toggleHidden } = useHiddenAmounts();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canAddMembers = isAdmin || currentUser?.role === 'MANAGER';
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => getMembers(),
  });

  const { data: deletedData = { content: [] }, isLoading: loadingDeleted } = useQuery({
    queryKey: ['members', 'deleted'],
    queryFn: () => getDeletedMembers({ size: 100 }),
    enabled: showDeleted && isAdmin,
  });
  const deletedMembers = deletedData.content ?? [];

  const memberIds = members.map((m) => m.id);
  const { data: balanceMap = {} } = useQuery({
    queryKey: ['memberBalancesBulk', memberIds],
    queryFn: () => getMemberBalanceBulk(memberIds),
    enabled: memberIds.length > 0,
    staleTime: 60_000,
  });

  const displayList = showDeleted ? deletedMembers : members;
  const filtered = [...displayList.filter((m) => {
    const q = search.toLowerCase();
    return (
      (m.fullName ?? '').toLowerCase().includes(q) ||
      (m.phone ?? '').includes(q) ||
      (m.email ?? '').toLowerCase().includes(q) ||
      (m.city ?? '').toLowerCase().includes(q)
    );
  })].sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));

  const isLoadingView = showDeleted ? loadingDeleted : isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}
          >
            Members
          </h2>
          <p className="text-sm text-gray-500 mt-1">{members.length} total members</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHidden}
            title={hidden ? 'Show amounts' : 'Hide amounts'}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          {isAdmin && (
            <Button
              variant={showDeleted ? 'danger' : 'secondary'}
              onClick={() => setShowDeleted((v) => !v)}
            >
              <Trash2 size={14} />
              {showDeleted ? 'Deleted Members' : 'Show Deleted'}
            </Button>
          )}
          {!showDeleted && canAddMembers && (
            <Button onClick={() => setShowModal(true)}>
              <Plus size={16} /> Add Member
            </Button>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Card header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
            {showDeleted ? 'Deleted Members' : 'All Members'}
          </h3>
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
            />
            <Input
              type="text"
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-56"
            />
          </div>
        </div>

        {isLoadingView ? (
          <PageSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={showDeleted ? Trash2 : Users}
            title={showDeleted ? 'No deleted members' : 'No members found'}
            message={
              showDeleted
                ? 'No members have been deleted yet.'
                : search ? 'Try a different search term.' : 'Add your first member to get started.'
            }
            action={!search && !showDeleted ? 'Add Member' : undefined}
            onAction={!search && !showDeleted ? () => setShowModal(true) : undefined}
          />
        ) : showDeleted ? (
          <Table columns={['Member', 'Phone', 'City', 'Deleted At', 'Status']}>
            {filtered.map((m) => (
              <Tr key={m.id} className="opacity-60" onClick={() => navigate(`/members/${m.id}`)}>
                <Td className="font-medium text-gray-900">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gray-400">
                      {(m.fullName ?? '?')[0].toUpperCase()}
                    </div>
                    <span className="line-through text-gray-500">{m.fullName}</span>
                  </div>
                </Td>
                <Td>{m.phone ? formatPhone(m.phoneCountryCode ?? '+91', m.phone) : <span className="text-xs text-gray-300 italic">Unavailable</span>}</Td>
                <Td>{m.city ?? <span className="text-xs text-gray-300 italic">Unavailable</span>}</Td>
                <Td className="text-xs text-gray-500">
                  {m.deletedAt
                    ? new Date(m.deletedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'}
                </Td>
                <Td>
                  <Badge variant="danger">Deleted</Badge>
                </Td>
              </Tr>
            ))}
          </Table>
        ) : (
          <Table columns={['Member', 'Phone', 'Email', 'City', 'Outstanding', 'Status']}>
            {filtered.map((m) => {
              const outstanding = Number(balanceMap[m.id] ?? 0);
              const hasBalance = outstanding > 0;
              return (
                <Tr key={m.id} onClick={() => navigate(`/members/${m.id}`)}>
                  <Td className="font-medium text-gray-900">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: '#1E3A5F' }}
                      >
                        {(m.fullName ?? m.name ?? '?')[0].toUpperCase()}
                      </div>
                      <span>{m.fullName ?? m.name}</span>
                    </div>
                  </Td>
                  <Td>{m.phone ? formatPhone(m.phoneCountryCode ?? '+91', m.phone) : <span className="text-xs text-gray-300 italic">Unavailable</span>}</Td>
                  <Td>{m.email ?? <span className="text-xs text-gray-300 italic">Unavailable</span>}</Td>
                  <Td>{m.city ?? <span className="text-xs text-gray-300 italic">Unavailable</span>}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {!hidden && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: hasBalance ? '#DC2626' : '#16A34A' }}
                        />
                      )}
                      {hidden ? (
                        <span className="text-sm font-medium text-gray-400 tracking-widest">••••••</span>
                      ) : hasBalance ? (
                        <span className="text-sm font-medium text-red-600">
                          ₹{outstanding.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Clear</span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={statusBadge(m.status ?? 'ACTIVE')}>
                      {m.status ?? 'ACTIVE'}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </div>

      {showModal && <AddMemberModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
