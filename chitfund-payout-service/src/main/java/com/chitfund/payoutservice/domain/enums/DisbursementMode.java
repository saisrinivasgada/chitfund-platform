package com.chitfund.payoutservice.domain.enums;

public enum DisbursementMode {
    CASH,           // physically handed over — no reference number
    UPI,            // UPI transaction ID in reference_number
    BANK_TRANSFER,  // UTR number in reference_number
    CHEQUE          // cheque number in reference_number
}
