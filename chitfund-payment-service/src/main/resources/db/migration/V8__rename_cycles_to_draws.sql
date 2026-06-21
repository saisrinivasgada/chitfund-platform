-- Rename chit_month_cycles → chit_month_draws to match updated domain language.
-- No FK constraints reference this table so the rename is safe.
RENAME TABLE chit_month_cycles TO chit_month_draws;

ALTER TABLE chit_month_draws
  DROP INDEX uk_chit_month_cycle,
  ADD UNIQUE KEY uk_chit_month_draw (chit_id, month_number);
