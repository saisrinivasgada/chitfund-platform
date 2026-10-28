const clearedStatuses = new Set(['SETTLED', 'SETTLEMENT_CLEARED', 'WAIVED', 'PAYOUT_DEDUCTED', 'CREDIT_COVERED']);
const outstandingStatuses = new Set(['OUTSTANDING', 'PARTIALLY_PAID', 'PARTIAL_CREDIT']);

export const isPaymentCleared = (status: string): boolean => clearedStatuses.has(status);
export const hasOutstandingPayment = (status: string): boolean => outstandingStatuses.has(status);
