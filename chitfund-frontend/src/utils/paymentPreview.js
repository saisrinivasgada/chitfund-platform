const paise = (value) => Math.round(Number(value) * 100);
const validMoney = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isFinite(Number(value)) && Number(value) >= 0
  && Number.isSafeInteger(paise(value))
  && Math.abs(Number(value) * 100 - paise(value)) < 0.000001;

export const isStalePaymentConflict = (error) => error?.response?.status === 409
  && error.response.data?.errorCode === 'GENERAL_006';

export function checkedPaymentPreview(data, { memberId, chitId, amount }) {
  if (typeof data?.balanceVersion !== 'string' || !data.balanceVersion.trim()
    || String(data.memberId) !== String(memberId)
    || String(data.primaryChitId) !== String(chitId)
    || !Array.isArray(data.allocations)) {
    throw new Error('Payment preview was incomplete. Please review again.');
  }

  const amounts = [data.requestedAmount, data.creditAvailable, data.creditConsumed,
    data.totalOutstanding, data.selectedChitOutstanding, data.projectedNewCredit];
  if (!validMoney(amount) || amounts.some((value) => !validMoney(value))
    || paise(data.requestedAmount) !== paise(amount)
    || paise(data.creditConsumed) > paise(data.creditAvailable)
    || paise(data.selectedChitOutstanding) > paise(data.totalOutstanding)
    || paise(data.creditConsumed) > paise(data.totalOutstanding)) {
    throw new Error('Payment preview amounts did not match this payment. Please review again.');
  }

  let cashApplied = 0;
  let creditApplied = 0;
  for (const row of data.allocations) {
    if (!row.chitId || !Number.isInteger(row.monthNumber) || row.monthNumber < 1
      || typeof row.catchUpLine !== 'boolean'
      || [row.creditApplied, row.newPaymentApplied].some((value) => !validMoney(value))) {
      throw new Error('Payment preview allocation was incomplete. Please review again.');
    }
    cashApplied += paise(row.newPaymentApplied);
    creditApplied += paise(row.creditApplied);
  }
  if (cashApplied + paise(data.projectedNewCredit) !== paise(amount)
    || creditApplied !== paise(data.creditConsumed)
    || cashApplied + creditApplied > paise(data.totalOutstanding)) {
    throw new Error('Payment preview allocation did not match the amount received. Please review again.');
  }
  return { data, cashApplied: cashApplied / 100 };
}
