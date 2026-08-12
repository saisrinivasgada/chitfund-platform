import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY = 'chitwise_biometric_enabled';
const BIOMETRIC_CREDS_KEY   = 'chitwise_biometric_creds';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled  = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const flag = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return flag === 'true';
  } catch {
    return false;
  }
}

export async function enableBiometric(username: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_CREDS_KEY, JSON.stringify({ username, password }));
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
}

export async function disableBiometric(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_CREDS_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
}

export async function promptBiometric(): Promise<{ username: string; password: string } | null> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:           'Sign in to ChitWise',
      fallbackLabel:           'Use password instead',
      disableDeviceFallback:   false,
      cancelLabel:             'Cancel',
    });
    if (!result.success) return null;

    const raw = await SecureStore.getItemAsync(BIOMETRIC_CREDS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function biometricTypeName(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Fingerprint';
    return 'Biometric';
  } catch {
    return 'Biometric';
  }
}
