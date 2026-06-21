package com.chitfund.paymentservice.domain.enums;

public enum CashRequestStatus {
    PENDING,    // member submitted — waiting for admin to assign a worker
    ASSIGNED,   // admin assigned a worker — worker should collect soon
    COLLECTED,  // worker collected the cash; linked to a PaymentBatch
    CANCELLED   // cancelled by member or admin before collection
}
