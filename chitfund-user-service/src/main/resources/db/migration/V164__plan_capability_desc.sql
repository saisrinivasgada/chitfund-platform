-- Add human-readable description and importance text to capability definitions.
-- Used by the capability gate popup shown when a tenant tries a locked feature.
ALTER TABLE plan_capability_defs
    ADD COLUMN description TEXT NULL AFTER label,
    ADD COLUMN importance  TEXT NULL AFTER description;

UPDATE plan_capability_defs SET
    description = 'Allows a member who wins a draw to exit early by receiving their prize payout minus the remaining contributions. The remaining members redistribute the freed slot.',
    importance  = 'Critical for competitive chit funds — members who know they can exit early are more willing to join. Without this, early-exit situations turn into disputes instead of clean processes.'
WHERE `key` = 'settlement';

UPDATE plan_capability_defs SET
    description = 'Full analytics dashboard with revenue trends, draw performance, member retention, and collection efficiency charts.',
    importance  = 'Chit fund admins need data to make decisions — which groups are profitable, which members are at risk, what draw timing works best.'
WHERE `key` = 'full_analytics';

UPDATE plan_capability_defs SET
    description = 'Priority email and phone support with a dedicated account manager and faster SLA.',
    importance  = 'When a collection dispute or system issue arises during a draw day, every minute matters. Priority support means same-day resolution.'
WHERE `key` = 'priority_support';

UPDATE plan_capability_defs SET
    description = 'Real-time live chat between members and your admin team — no more WhatsApp groups or missed calls.',
    importance  = 'Chit fund trust is built on communication. Members who can quickly ask about payment status or draw results stay engaged and on-time.'
WHERE `key` = 'live_chat';
