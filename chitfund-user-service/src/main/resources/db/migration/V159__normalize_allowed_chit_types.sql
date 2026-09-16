-- ChitType was standardized to RESERVATION / LOTTERY / AUCTION, but legacy
-- plan rows still carried the former STANDARD / POST_PAYOUT / FLEXI labels.
-- Keep named plans at their current reservation-only entitlement; custom plans
-- retain the ability to explicitly enable all three current types.
UPDATE plan_limits
SET allowed_chit_types = CASE
    WHEN plan = 'CUSTOM' THEN 'RESERVATION,LOTTERY,AUCTION'
    ELSE 'RESERVATION'
END
WHERE allowed_chit_types REGEXP '(^|,)(STANDARD|POST_PAYOUT|FLEXI)(,|$)';

UPDATE tenant_custom_limits
SET allowed_chit_types = CASE
    WHEN plan_code = 'CUSTOM' THEN 'RESERVATION,LOTTERY,AUCTION'
    ELSE 'RESERVATION'
END
WHERE allowed_chit_types REGEXP '(^|,)(STANDARD|POST_PAYOUT|FLEXI)(,|$)';
