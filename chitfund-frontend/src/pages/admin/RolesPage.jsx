import { Check, Minus, X, Shield, Briefcase, UserCheck } from 'lucide-react';

const ROLES = [
  { key: 'ADMIN',   label: 'Admin',   icon: Shield,    color: '#1E3A5F', bg: '#EFF3F8', border: '#BFCFDE' },
  { key: 'MANAGER', label: 'Manager', icon: Briefcase, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { key: 'STAFF',   label: 'Staff',   icon: UserCheck, color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
];

// ✓ = full, ~ = limited, — = none
const SECTIONS = [
  {
    title: 'Members',
    rows: [
      { label: 'View member list',                ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Add / edit members',              ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Create member portal login',      ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'View member transaction history', ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
    ],
  },
  {
    title: 'Chit Funds',
    rows: [
      { label: 'View all chit funds',                 ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Create / edit chit funds',            ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Activate / deactivate chit',          ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Manage enrollment & reservations',    ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'Draws',
    rows: [
      { label: 'View draw results & winners',    ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Open a draw',                    ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Skip a draw',                    ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Close / delete a draw',          ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Record draw winner',             ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'All draw actions are audited',   ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
    ],
  },
  {
    title: 'Payments',
    rows: [
      { label: 'Record payments for members',  ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'View payment history',         ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Approve cash collection requests', ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Cash pickups (field)',         ADMIN: '✓', MANAGER: '✓', STAFF: '✓' },
      { label: 'Pending remittance view',      ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
    ],
  },
  {
    title: 'Payouts',
    rows: [
      { label: 'View payouts',             ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Create payout record',     ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Disburse / cancel payout', ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'Team',
    rows: [
      { label: 'View team members',           ADMIN: '✓', MANAGER: '~', STAFF: '—', managerNote: 'Cannot see other Admins' },
      { label: 'Add Staff / Manager accounts', ADMIN: '✓', MANAGER: '~', STAFF: '—', managerNote: 'Cannot create Admin accounts' },
      { label: 'Add Admin accounts',          ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Deactivate / remove staff',   ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'Reports & Treasury',
    rows: [
      { label: 'View reports',          ADMIN: '✓', MANAGER: '✓', STAFF: '—' },
      { label: 'Treasury overview',     ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'Settlement operations', ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
  {
    title: 'System',
    rows: [
      { label: 'Reset member passwords',   ADMIN: '✓', MANAGER: '—', STAFF: '—' },
      { label: 'View admin audit logs',    ADMIN: '✓', MANAGER: '—', STAFF: '—' },
    ],
  },
];

function Cell({ value, note }) {
  if (value === '✓') return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100">
        <Check size={13} className="text-green-700" strokeWidth={2.5} />
      </span>
    </div>
  );
  if (value === '~') return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100">
        <Minus size={13} className="text-amber-700" strokeWidth={2.5} />
      </span>
      {note && <span className="text-[10px] text-amber-600 text-center leading-tight max-w-[80px]">{note}</span>}
    </div>
  );
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100">
      <X size={12} className="text-gray-400" strokeWidth={2.5} />
    </span>
  );
}

export default function RolesPage() {
  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#1E3A5F', fontFamily: 'Merriweather, serif' }}>
          Role Permissions
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          What each team role can do across the platform.
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-3 gap-4">
        {ROLES.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.key}
              className="rounded-xl border p-4"
              style={{ borderColor: r.border, backgroundColor: r.bg }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: r.color }}
                >
                  <Icon size={16} className="text-white" />
                </div>
                <p className="font-bold text-gray-900">{r.label}</p>
              </div>
              <p className="text-xs text-gray-600 leading-snug">
                {r.key === 'ADMIN'   && 'Full platform access. Manages chit funds, draws, disbursements, team, and system settings.'}
                {r.key === 'MANAGER' && 'Operations oversight. Opens, skips, and closes draws. Collects payments and creates payouts — but cannot disburse funds. All draw actions are audited.'}
                {r.key === 'STAFF'   && 'Field operations. Handles cash pickups from members. No access to financials or fund management.'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
            <Check size={11} className="text-green-700" strokeWidth={2.5} />
          </span>
          Full access
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100">
            <Minus size={11} className="text-amber-700" strokeWidth={2.5} />
          </span>
          Limited access
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100">
            <X size={11} className="text-gray-400" strokeWidth={2.5} />
          </span>
          No access
        </span>
      </div>

      {/* Permissions table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_80px_80px] border-b border-gray-100 bg-gray-50">
          <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Feature</div>
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.key} className="py-3 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: r.color }}
                  >
                    <Icon size={14} className="text-white" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{r.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sections */}
        {SECTIONS.map((section, si) => (
          <div key={section.title}>
            {/* Section title */}
            <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{section.title}</p>
            </div>
            {/* Rows */}
            {section.rows.map((row, ri) => (
              <div
                key={row.label}
                className={`grid grid-cols-[1fr_80px_80px_80px] items-center border-b ${
                  ri === section.rows.length - 1 && si === SECTIONS.length - 1
                    ? 'border-transparent'
                    : 'border-gray-100'
                }`}
              >
                <div className="px-5 py-3.5 text-sm text-gray-700">{row.label}</div>
                {ROLES.map((r) => (
                  <div key={r.key} className="flex items-center justify-center py-3.5">
                    <Cell
                      value={row[r.key]}
                      note={r.key === 'MANAGER' ? row.managerNote : undefined}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
