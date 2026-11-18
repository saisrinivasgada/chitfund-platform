type SettlementBalance = {
  netAmount?: number | string | null;
  collectedAmount?: number | string | null;
  disbursedAmount?: number | string | null;
};

const toPaise = (amount: number | string | null | undefined) =>
  Math.round(Number(amount ?? 0) * 100);

export function remainingSettlementAmount(settlement: SettlementBalance | null | undefined): number {
  if (!settlement) return 0;
  const net = Number(settlement.netAmount ?? 0);
  const moved = net > 0 ? settlement.collectedAmount : settlement.disbursedAmount;
  return Math.max(0, Math.abs(toPaise(net)) - toPaise(moved)) / 100;
}

export function parseSettlementPaymentAmount(input: string, remaining: number): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(input.trim())) return null;
  const paise = toPaise(input);
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > toPaise(remaining)) return null;
  return paise / 100;
}
