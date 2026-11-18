package com.chitfund.payoutservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CancelPayoutRequest {

    @NotBlank
    @Size(min = 5, max = 500, message = "Cancellation reason must be between 5 and 500 characters")
    private String reason;

    /**
     * Required for CASH and CHEQUE disbursements: admin must confirm the physical money
     * was returned to the organisation before the treasury credit is recorded.
     * For UPI/BANK_TRANSFER this field is ignored — the digital trail is sufficient.
     */
    private boolean cashReturnConfirmed = false;
}
