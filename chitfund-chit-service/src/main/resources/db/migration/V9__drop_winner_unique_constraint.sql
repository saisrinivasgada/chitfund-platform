-- Remove the unique constraint so the same member can win the same cycle
-- multiple times when they hold multiple reserved spots in the chit.
-- Duplicate prevention is now handled in WinnerService via spot-count vs win-count logic.
ALTER TABLE monthly_winners DROP INDEX uk_chit_month_member;
