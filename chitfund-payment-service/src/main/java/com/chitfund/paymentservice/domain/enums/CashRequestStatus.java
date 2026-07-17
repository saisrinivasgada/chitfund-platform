package com.chitfund.paymentservice.domain.enums;

public enum CashRequestStatus {
    PENDING,             // submitted — waiting for admin to assign a worker and/or set a date
    SCHEDULED,           // date set by admin — no worker assigned yet; worker to be assigned later
    ASSIGNED,            // worker assigned — worker should visit member on/around scheduled date
    PICKED_UP,           // worker physically collected cash — awaiting admin confirmation
    PARTIALLY_COLLECTED, // worker collected less than requested; member approval pending
    COLLECTED,           // admin confirmed receipt; linked to a PaymentBatch
    CANCELLED            // cancelled before collection
}
