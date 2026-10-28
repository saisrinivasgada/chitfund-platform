import type { ComponentType } from 'react';
import { requireNativeView } from 'expo';
import { Platform, type ViewProps } from 'react-native';

type Props = ViewProps & {
  active: boolean;
  protectionEnabled: boolean;
  busy: boolean;
  title: string;
  message: string;
  buttonTitle: string;
  canSignOut: boolean;
  onUnlockPress: () => void;
  onSignOutPress: () => void;
};
// iOS requires a rebuilt native app. Do not silently fall back to a modal which
// can leave payment sheets visible above the lock screen.
export const NativeDeviceLock: ComponentType<Props> | null = Platform.OS === 'ios'
  ? requireNativeView<Props>('ChitWiseDeviceLock') : null;
