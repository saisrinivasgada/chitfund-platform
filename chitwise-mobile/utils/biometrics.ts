import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { StoredAccount } from '../store/authStore';

// Retain the preference key so existing installations keep their app lock.
const ENABLED_KEY = 'chitwise_biometric_enabled';
const LEGACY_CREDS_KEY = 'chitwise_biometric_creds';
const ACCOUNT_KEY = 'chitwise_device_unlock_account';
let authenticating = false;
let changingSetting = false;
const listeners = new Set<(enabled: boolean, accountId?: string) => void>();

export function subscribeDeviceUnlock(listener: (enabled: boolean, accountId?: string) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function deviceAuthenticationInProgress() { return authenticating; }

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    // SECRET includes a device PIN/pattern/password even without biometric hardware.
    return await LocalAuthentication.getEnrolledLevelAsync() >= LocalAuthentication.SecurityLevel.SECRET;
  } catch { return false; }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  // An unreadable setting must not silently disable a configured lock.
  return await SecureStore.getItemAsync(ENABLED_KEY) === 'true';
}

export async function authenticateDevice(promptMessage = 'Unlock ChitWise'): Promise<boolean> {
  // Do not share one OS approval between concurrent account selections.
  if (authenticating || Platform.OS === 'web') return false;
  authenticating = true;
  try {
    if (!await isBiometricAvailable()) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use device passcode',
      disableDeviceFallback: false,
      biometricsSecurityLevel: 'weak',
      cancelLabel: 'Cancel',
    });
    return result.success;
  } catch { return false; }
  finally { authenticating = false; }
}

export async function enableBiometric(accountId: string): Promise<boolean> {
  if (changingSetting) return false;
  changingSetting = true;
  try {
    if (!await authenticateDevice('Enable ChitWise device unlock')) return false;
    await SecureStore.setItemAsync(ACCOUNT_KEY, accountId);
    await SecureStore.setItemAsync(ENABLED_KEY, 'true');
    // This is metadata only. Tokens live exclusively in the rotating account store.
    await SecureStore.deleteItemAsync(LEGACY_CREDS_KEY).catch(() => {});
    listeners.forEach((listener) => listener(true, accountId));
    return true;
  } finally { changingSetting = false; }
}

export async function disableBiometric(): Promise<boolean> {
  if (changingSetting) return false;
  changingSetting = true;
  try {
    if (!await authenticateDevice('Disable ChitWise device unlock')) return false;
    await SecureStore.deleteItemAsync(ENABLED_KEY);
    listeners.forEach((listener) => listener(false));
    await SecureStore.deleteItemAsync(ACCOUNT_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(LEGACY_CREDS_KEY).catch(() => {});
    return true;
  } finally { changingSetting = false; }
}

export async function rememberUnlockAccount(accountId: string) {
  if (await isBiometricEnabled()) {
    await SecureStore.setItemAsync(ACCOUNT_KEY, accountId);
    await SecureStore.deleteItemAsync(LEGACY_CREDS_KEY).catch(() => {});
  }
}

export async function promptBiometric(accounts: StoredAccount[]): Promise<string | null> {
  if (!await isBiometricEnabled() || !await authenticateDevice('Unlock your saved ChitWise account')) return null;
  const accountId = await SecureStore.getItemAsync(ACCOUNT_KEY);
  const eligible = accounts.filter((account) => account.sessionValid && account.authSource !== 'HUB');
  if (accountId) return eligible.find((account) => account.accountId === accountId)?.accountId ?? null;
  // Migrate the old duplicate token only when its identity is unambiguous.
  try {
    const legacy = JSON.parse(await SecureStore.getItemAsync(LEGACY_CREDS_KEY) ?? 'null');
    const matches = eligible.filter((account) => account.username === legacy?.username && account.refreshToken === legacy?.refreshToken);
    if (matches.length !== 1) return null;
    await rememberUnlockAccount(matches[0].accountId);
    return matches[0].accountId;
  } catch { return null; }
}

export async function biometricTypeName(): Promise<string> {
  if (Platform.OS !== 'ios') return 'Device unlock';
  try {
    if (!await LocalAuthentication.isEnrolledAsync()) return 'Device passcode';
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Touch ID';
  } catch { /* The OS credential prompt remains the fallback. */ }
  return 'Device passcode';
}
