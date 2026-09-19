import { Image, ImageStyle, StyleProp } from 'react-native';

const ROLE_IMAGES = {
  ADMIN: require('../assets/role-admin.png'),
  MANAGER: require('../assets/role-manager.png'),
  STAFF: require('../assets/role-staff.png'),
  WORKER: require('../assets/role-staff.png'),
  AGENT: require('../assets/role-staff.png'),
  MEMBER: require('../assets/role-member.png'),
  SUPER_ADMIN: require('../assets/hub-icon.png'),
  SUPPORT_AGENT: require('../assets/hub-icon.png'),
  HUB: require('../assets/hub-icon.png'),
} as const;

type RoleLogoProps = {
  role?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function roleLogoSource(role?: string | null) {
  return ROLE_IMAGES[role as keyof typeof ROLE_IMAGES] ?? ROLE_IMAGES.ADMIN;
}

export default function RoleLogo({ role, size = 42, style }: RoleLogoProps) {
  return (
    <Image
      source={roleLogoSource(role)}
      accessibilityLabel={`ChitWise ${role === 'SUPER_ADMIN' || role === 'SUPPORT_AGENT' ? 'Hub' : (role ?? 'Admin')}`}
      resizeMode="contain"
      style={[{ width: size, height: size, borderRadius: Math.max(8, size * 0.2) }, style]}
    />
  );
}
