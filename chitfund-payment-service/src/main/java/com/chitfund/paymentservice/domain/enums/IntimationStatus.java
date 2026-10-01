package com.chitfund.paymentservice.domain.enums;

public enum IntimationStatus {
    PENDING,    // member submitted, awaiting admin action
    APPROVED,   // admin approved and payment batches were created
    REJECTED,   // admin rejected
    WITHDRAWN,  // member withdrew before admin acted
    VOIDED      // admin voided an already-approved intimation (reverses batches)
}
