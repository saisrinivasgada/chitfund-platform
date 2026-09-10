import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { getMembers, listStaff, startConversation, createGroup } from '../../services/api';
import { formatPhone } from '../ui/PhoneInput';
import { X, ChevronLeft, Search, Loader2, MessageCircle, UsersRound, Check } from 'lucide-react';

// ── PersonRow — shared name + phone/city display ────────────────────────────────

function PersonRow({ name, phone, phoneCountryCode, city, role, selected, onClick, checkbox }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left cursor-pointer"
    >
      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-xs flex-shrink-0">
        {(name ?? '?')[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          {role && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide flex-shrink-0">
              {role}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 truncate mt-0.5">
          {phone ? formatPhone(phoneCountryCode ?? '+91', phone) : ''}
          {phone && city ? '  ·  ' : ''}
          {city ?? ''}
        </p>
      </div>
      {checkbox && (
        <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
          selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
        }`}>
          {selected && <Check size={13} className="text-white" />}
        </div>
      )}
    </button>
  );
}

// ── Step: choose action ──────────────────────────────────────────────────────────

function ChooseStep({ canDm, canCreateGroup, onPick }) {
  return (
    <div className="p-4 space-y-2.5">
      {canDm && (
        <button
          onClick={() => onPick('member')}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
            <MessageCircle size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Message a Member</p>
            <p className="text-xs text-gray-500">Start a 1-on-1 chat</p>
          </div>
        </button>
      )}
      {canCreateGroup && (
        <button
          onClick={() => onPick('group')}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors cursor-pointer text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
            <UsersRound size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Create Group</p>
            <p className="text-xs text-gray-500">Chat with multiple people at once</p>
          </div>
        </button>
      )}
    </div>
  );
}

// ── Step: pick a single member (1-on-1) ──────────────────────────────────────────

function MemberPickStep({ onStarted }) {
  const [search, setSearch] = useState('');

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members-for-chat'],
    queryFn: () => getMembers({ status: 'ACTIVE' }),
    staleTime: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: (member) => startConversation({ memberId: member.userId, memberName: member.fullName }),
    onSuccess: onStarted,
  });

  const eligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => m.hasAppAccess && m.userId)
      .filter((m) => !q || (m.fullName ?? '').toLowerCase().includes(q) || (m.phone ?? '').includes(q))
      .sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
  }, [members, search]);

  return (
    <>
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by name or phone..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
        ) : eligible.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400 gap-2 px-6 text-center">
            <MessageCircle size={28} className="opacity-40" />
            <p className="text-xs">No members with app access found.</p>
          </div>
        ) : (
          eligible.map((m) => (
            <PersonRow
              key={m.userId}
              name={m.fullName}
              phone={m.phone}
              phoneCountryCode={m.phoneCountryCode}
              city={m.city}
              onClick={() => startMutation.mutate(m)}
            />
          ))
        )}
      </div>
      {startMutation.isPending && (
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="animate-spin" size={13} /> Starting conversation...
        </div>
      )}
      {startMutation.isError && (
        <p className="px-4 py-2 border-t border-gray-100 text-xs text-red-500">
          Couldn't start the conversation. Please try again.
        </p>
      )}
    </>
  );
}

// ── Step: create group (name/desc, then pick members) ────────────────────────────

function GroupCreateStep({ onCreated }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('details'); // 'details' | 'members'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Map()); // userId -> {userId, userName, role}
  const [error, setError] = useState('');

  const { data: members = [] } = useQuery({
    queryKey: ['members-for-chat'],
    queryFn: () => getMembers({ status: 'ACTIVE' }),
    staleTime: 30_000,
    enabled: phase === 'members',
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff-for-chat'],
    queryFn: () => listStaff({ deleted: false }),
    staleTime: 30_000,
    enabled: phase === 'members',
  });

  const createMutation = useMutation({
    mutationFn: () => createGroup({
      name: name.trim(),
      description: description.trim() || undefined,
      memberIds: [...selected.keys()],
      members: [...selected.values()],
    }),
    onSuccess: onCreated,
    onError: (err) => setError(err?.response?.data?.message ?? 'Failed to create group'),
  });

  // Org people (members + staff), excluding the creator themselves
  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    const memberPeople = members
      .filter((m) => m.hasAppAccess && m.userId && m.userId !== user?.id)
      .map((m) => ({ userId: m.userId, userName: m.fullName, role: 'MEMBER', phone: m.phone, phoneCountryCode: m.phoneCountryCode, city: m.city }));
    const staffPeople = staff
      .filter((s) => s.id && s.id !== user?.id)
      .map((s) => ({ userId: s.id, userName: s.fullName ?? s.username, role: s.role, phone: s.phone, phoneCountryCode: s.phoneCountryCode, city: undefined }));
    return [...staffPeople, ...memberPeople]
      .filter((p) => !q || (p.userName ?? '').toLowerCase().includes(q) || (p.phone ?? '').includes(q))
      .sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? ''));
  }, [members, staff, user?.id, search]);

  function toggle(p) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.userId)) next.delete(p.userId);
      else next.set(p.userId, { userId: p.userId, userName: p.userName, role: p.role });
      return next;
    });
  }

  if (phase === 'details') {
    return (
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Group Name *</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chit Group A Members"
            maxLength={100}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-200"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this group for?"
            maxLength={255}
            className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-200"
          />
        </div>
        <button
          onClick={() => setPhase('members')}
          disabled={name.trim().length < 2}
          className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          Next: Add Members
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 py-2 border-b border-gray-100">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search org people..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-200"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {people.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400 gap-2 px-6 text-center">
            <UsersRound size={28} className="opacity-40" />
            <p className="text-xs">No other org people found.</p>
          </div>
        ) : (
          people.map((p) => (
            <PersonRow
              key={p.userId}
              name={p.userName}
              phone={p.phone}
              phoneCountryCode={p.phoneCountryCode}
              city={p.city}
              role={p.role}
              checkbox
              selected={selected.has(p.userId)}
              onClick={() => toggle(p)}
            />
          ))
        )}
      </div>
      {error && <p className="px-4 py-1.5 text-xs text-red-500">{error}</p>}
      <div className="border-t border-gray-100 p-3">
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
          Create Group {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>
    </>
  );
}

// ── NewChatModal (entry point) ────────────────────────────────────────────────

export default function NewChatModal({ canDm, canCreateGroup, onClose, onConversationStarted, onGroupCreated }) {
  const bothAvailable = canDm && canCreateGroup;
  const [step, setStep] = useState(bothAvailable ? 'choose' : canDm ? 'member' : 'group');

  const titles = { choose: 'New Chat', member: 'Message a Member', group: 'Create Group' };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          {bothAvailable && step !== 'choose' && (
            <button
              onClick={() => setStep('choose')}
              className="text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <h3 className="text-sm font-bold text-gray-900 flex-1">{titles[step]}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0">
          {step === 'choose' && (
            <ChooseStep canDm={canDm} canCreateGroup={canCreateGroup} onPick={setStep} />
          )}
          {step === 'member' && (
            <MemberPickStep onStarted={onConversationStarted} />
          )}
          {step === 'group' && (
            <GroupCreateStep onCreated={onGroupCreated} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
