const ROLE_LOGO = {
  ADMIN: '/admin-logo.svg',
  MANAGER: '/manager-logo.svg',
  STAFF: '/staff-logo.svg',
  WORKER: '/staff-logo.svg',
  AGENT: '/staff-logo.svg',
  MEMBER: '/member-logo.svg',
  SUPER_ADMIN: '/hub-logo.svg',
  HUB: '/hub-logo.svg',
};

const ROLE_LABEL = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Staff',
  WORKER: 'Staff',
  AGENT: 'Staff',
  MEMBER: 'Member',
  SUPER_ADMIN: 'Hub',
  HUB: 'Hub',
};

export function roleLogoSrc(role) {
  return ROLE_LOGO[role] ?? ROLE_LOGO.ADMIN;
}

export function roleDisplayName(role) {
  return ROLE_LABEL[role] ?? 'Admin';
}

export default function RoleLogo({ role, className = 'w-8 h-8', title }) {
  const label = roleDisplayName(role);
  return (
    <img
      src={roleLogoSrc(role)}
      alt={`ChitWise ${label}`}
      title={title ?? `ChitWise ${label}`}
      className={`${className} rounded-lg flex-shrink-0 object-contain`}
    />
  );
}
