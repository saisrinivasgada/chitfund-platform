import { useState } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { C } from './ui';
import EditProfileModal from './EditProfileModal';

interface Props {
  size?: number;
  bgColor?: string;
  textColor?: string;
}

export function ProfileAvatarButton({ size = 36, bgColor, textColor }: Props) {
  const { user } = useAuthStore();
  const [show, setShow] = useState(false);
  const bg = bgColor ?? C.navy;
  const radius = size / 2;

  return (
    <>
      <TouchableOpacity
        onPress={() => setShow(true)}
        activeOpacity={0.75}
        style={{
          width: size, height: size, borderRadius: radius,
          backgroundColor: bg,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: textColor ?? C.white }}>
          {(user?.fullName ?? user?.username ?? '?')[0].toUpperCase()}
        </Text>
      </TouchableOpacity>
      <EditProfileModal visible={show} onClose={() => setShow(false)} />
    </>
  );
}
