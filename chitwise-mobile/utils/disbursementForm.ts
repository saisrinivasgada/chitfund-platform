type DisbursementInput = {
  amount: string;
  remaining: unknown;
  mode: string;
  referenceNumber: string;
};

export function disbursementFormError({ amount, remaining, mode, referenceNumber }: DisbursementInput): string | null {
  const entered = amount.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(entered)) return 'Enter an amount with at most two decimal places.';
  const amountPaise = Math.round(Number(entered) * 100);
  const remainingPaise = Math.round(Number(remaining) * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return 'Enter an amount greater than zero.';
  if (!Number.isSafeInteger(remainingPaise) || remainingPaise <= 0) return 'Refresh the payout balance before disbursing.';
  if (amountPaise > remainingPaise) return 'Amount exceeds the remaining payout balance.';
  if (mode !== 'CASH' && !referenceNumber.trim()) return 'Enter the transaction or cheque reference for this payment mode.';
  return null;
}
