-- Allow multiple winners per cycle (e.g. double payout for extra member).
-- Old constraint: unique(chit_id, month_number) — only one winner per cycle.
-- New constraint: unique(chit_id, month_number, member_id) — same member can't win the same cycle twice,
-- but two different members can both receive a payout in the same cycle.
ALTER TABLE monthly_winners DROP INDEX uk_chit_month_winner;
ALTER TABLE monthly_winners ADD CONSTRAINT uk_chit_month_member UNIQUE (chit_id, month_number, member_id);
