-- WHY: Workers can defer a cash pickup when a member is unavailable.
-- Instead of cancelling and re-creating, they set a scheduledFor date
-- (Tomorrow / Next Week). Admin is notified; request stays ASSIGNED.

ALTER TABLE cash_payment_requests
    ADD COLUMN scheduled_for DATETIME(6) NULL AFTER picked_up_by;
