package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * An explicit portion of a payment to apply to one of the member's chits.
 *
 * The payment service still records allocations at month level, but accepting
 * the intent at chit level lets the web/mobile clients collect across several
 * chits without silently spilling money into an unselected chit.
 */
@Data
public class RequestedChitAllocation {

    @NotNull
    private UUID chitId;

    @NotNull
    @DecimalMin(value = "0.01", message = "Allocation amount must be greater than zero")
    private BigDecimal amount;
}
