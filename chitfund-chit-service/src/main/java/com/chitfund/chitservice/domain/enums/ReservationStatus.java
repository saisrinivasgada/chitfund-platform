package com.chitfund.chitservice.domain.enums;

public enum ReservationStatus {
    RESERVED,      // Member assigned to this payout slot
    UNALLOCATED,   // Month has no member yet; pool accumulates
    PROCESSED,     // Payout disbursed
    VOIDED         // Transaction voided by admin
}
