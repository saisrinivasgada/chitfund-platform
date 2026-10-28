import { authenticateDevice, isBiometricEnabled } from './biometrics';
import { authorizeDeviceSession } from './deviceUnlockSession';

/** Password/OTP proof does not bypass an already configured device lock. */
export async function authorizeAccountLogin(accountId: string, deviceAlreadyApproved = false): Promise<boolean> {
  if (await isBiometricEnabled() && !deviceAlreadyApproved && !await authenticateDevice('Unlock your ChitWise account')) return false;
  authorizeDeviceSession(accountId);
  return true;
}
