-- Allow null assigned_by in monthly_winners for system-initiated closes (auto-close scheduler)
ALTER TABLE monthly_winners MODIFY COLUMN assigned_by VARCHAR(36) NULL;
