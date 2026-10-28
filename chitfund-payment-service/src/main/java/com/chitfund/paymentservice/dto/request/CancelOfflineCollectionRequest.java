package com.chitfund.paymentservice.dto.request;
import jakarta.validation.constraints.*;
/** A mistaken entry is retained in history. Actual collected money must be reconciled or returned. */
public record CancelOfflineCollectionRequest(@NotBlank @Size(min=5,max=500) String reason, @AssertTrue boolean noMoneyCollected) { }
