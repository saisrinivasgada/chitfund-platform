package com.chitfund.paymentservice.domain.enums;

public enum CashRequestStatus {
    PENDING,    // member submitted — waiting for admin to assign a worker
    ASSIGNED,   // admin assigned a worker — worker should visit member soon
    PICKED_UP,  // worker physically collected cash from member — awaiting admin confirmation
    COLLECTED,  // admin confirmed receipt; linked to a PaymentBatch
    CANCELLED   // cancelled by member or admin before collection
}
