const toPaise = (rupees) => Math.round(Number(rupees) * 100);

export function createChitPreview({ payingCount, orgCount, installment, postPayoutEnabled, postPayoutAmount, schedule }) {
  const positions = payingCount + orgCount;
  const selectedOrg = schedule.filter((row) => row.memberId === 'ORG').length;
  const complete = positions > 0 && schedule.length === positions && selectedOrg === orgCount
    && schedule.every((row) => Number(row.payoutAmount) > 0);
  const basePaise = toPaise(installment);
  const monthlyBase = payingCount * basePaise / 100;
  if (!complete) return { positions, selectedOrg, monthlyBase, complete: false };

  let collections = 0;
  let memberPayouts = 0;
  let orgPayouts = 0;
  let runningCash = 0;
  let fundingNeed = 0;
  for (let month = 0; month < positions; month += 1) {
    const monthlyCollection = schedule.reduce((sum, row, payoutIndex) => {
      if (row.memberId === 'ORG') return sum;
      const laterPaise = postPayoutEnabled
        ? toPaise(Number(row.postPayoutContribution) || postPayoutAmount)
        : basePaise;
      return sum + (month > payoutIndex ? laterPaise : basePaise);
    }, 0);
    collections += monthlyCollection;
    const payout = toPaise(schedule[month].payoutAmount);
    if (schedule[month].memberId === 'ORG') orgPayouts += payout;
    else memberPayouts += payout;
    runningCash += monthlyCollection - (schedule[month].memberId === 'ORG' ? 0 : payout);
    fundingNeed = Math.max(fundingNeed, -runningCash);
  }
  return {
    positions, selectedOrg, monthlyBase, complete: true,
    collections: collections / 100,
    memberPayouts: memberPayouts / 100,
    orgPayouts: orgPayouts / 100,
    estimatedMargin: (collections - memberPayouts) / 100,
    fundingNeed: fundingNeed / 100,
  };
}
