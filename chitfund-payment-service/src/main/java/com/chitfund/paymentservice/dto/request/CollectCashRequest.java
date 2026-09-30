package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class CollectCashRequest {

    @NotNull
    private UUID chitId;

    @NotNull
    private UUID memberId;

    @NotNull
    @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
    private BigDecimal amount;

    private String notes;

    // Admin recording on behalf of a worker/manager — if set, overrides auth.getPrincipal() as collectedBy
    private UUID overrideCollectedBy;

    // Set true to proceed anyway when the server flags this as a possible duplicate
    // of another very recent payment for the same member/chit/amount (e.g. the same
    // cash was already recorded through another device/channel). Defaults to false —
    // the caller must explicitly confirm this isn't a duplicate.
    private boolean confirmDuplicate;
}
