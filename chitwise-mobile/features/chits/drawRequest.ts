/** Build the payment service's OpenMonthRequest from the downloaded chit data. */
export function buildOpenDrawRequest(chit: any, monthNumber: number, enrollments: any[], winners: any[], reservations: any[]) {
  if (!chit?.id || !Number.isInteger(monthNumber) || monthNumber < 1) throw new Error('Choose a valid draw number.');
  const installmentAmount = Number(chit.installmentAmount ?? Number(chit.chitValue) / Number(chit.capacity));
  const maxCycles = Number(chit.capacity);
  if (!(installmentAmount > 0) || !Number.isFinite(installmentAmount) || !Number.isInteger(maxCycles) || maxCycles < 1) throw new Error('Refresh the chit’s installment and capacity before opening a draw.');
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chit.startDate ?? '');
  if (!parts) throw new Error('Set the chit’s start date before opening a draw.');
  const start = new Date(`${chit.startDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== chit.startDate) throw new Error('Set a valid chit start date.');
  const [, year, month, day] = parts.map(Number);
  const target = new Date(Date.UTC(year, month - 1 + monthNumber - 1, 1));
  const dueDay = Number.isInteger(chit.monthlyDueDate) && chit.monthlyDueDate >= 1 && chit.monthlyDueDate <= 28 ? Number(chit.monthlyDueDate) : day;
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(dueDay, lastDay));
  const spots = new Map<string, number>();
  for (const row of enrollments) {
    const id = row.memberId ?? row.id;
    if (id && row.active !== false) spots.set(id, (spots.get(id) ?? 0) + 1);
  }
  if (!spots.size) throw new Error('Load the enrolled members before opening a draw.');
  const won = new Map<string, number>();
  const winningRows = chit.chitType === 'LOTTERY' ? winners : reservations.filter(row => row.status === 'PROCESSED');
  for (const row of winningRows) if (row.memberId) won.set(row.memberId, (won.get(row.memberId) ?? 0) + 1);
  const postAmount = chit.postPayoutContributionEnabled ? Number(chit.defaultPostPayoutContribution ?? installmentAmount) : installmentAmount;
  if (!Number.isFinite(postAmount) || postAmount < 0) throw new Error('Refresh the post-payout installment before opening a draw.');
  return { chitId: chit.id, monthNumber, dueDate: target.toISOString().slice(0, 10), installmentAmount, maxCycles,
    members: [...spots].map(([memberId, count]) => {
      const wins = Math.min(count, won.get(memberId) ?? 0);
      return { memberId, amountDue: Math.round((wins * postAmount + (count - wins) * installmentAmount) * 100) / 100 };
    }),
  };
}
