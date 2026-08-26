-- Admin commission support for auction sessions.
-- commissionType: 'FIXED' (flat ₹ amount) or 'PERCENTAGE' (% of discount)
-- commissionValue: the entered value (₹ amount or percentage, depending on type)
-- commissionAmount: resolved ₹ amount, computed and stored when auction closes
-- showCommissionToMembers: if true, members can see the commission breakdown in the auction room
ALTER TABLE auction_sessions
    ADD COLUMN commission_type        VARCHAR(10)    NULL,
    ADD COLUMN commission_value       DECIMAL(15,2)  NULL,
    ADD COLUMN commission_amount      DECIMAL(15,2)  NULL,
    ADD COLUMN show_commission_to_members BOOLEAN NOT NULL DEFAULT FALSE;
