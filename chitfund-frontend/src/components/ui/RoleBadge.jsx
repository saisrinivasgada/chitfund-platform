import { ShieldCheck, Briefcase, User } from 'lucide-react';

const ROLE_CONFIG = {
  ADMIN:   { label: 'Admin',   cls: 'bg-[#1E3A5F] text-white',  Icon: ShieldCheck },
  MANAGER: { label: 'Manager', cls: 'bg-amber-500 text-white',   Icon: Briefcase   },
  STAFF:   { label: 'Staff',   cls: 'bg-emerald-600 text-white', Icon: User        },
  WORKER:  { label: 'Staff',   cls: 'bg-emerald-600 text-white', Icon: User        },
};

export default function RoleBadge({ role, className = '' }) {
  const cfg = ROLE_CONFIG[role?.toUpperCase()];
  if (!cfg) return null;
  const { label, cls, Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls} ${className}`}>
      <Icon size={10} strokeWidth={2.5} />
      {label}
    </span>
  );
}
