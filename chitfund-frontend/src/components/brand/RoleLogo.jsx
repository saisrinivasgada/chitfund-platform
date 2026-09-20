import { roleDisplayName, roleLogoSrc } from './roleLogoConfig';

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
