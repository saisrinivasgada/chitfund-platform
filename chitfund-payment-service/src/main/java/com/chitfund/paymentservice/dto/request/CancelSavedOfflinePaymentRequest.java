package com.chitfund.paymentservice.dto.request;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
public record CancelSavedOfflinePaymentRequest(@NotNull UUID originalActorId,
        @Valid @NotNull RecordPaymentRequest original, @Valid @NotNull CancelOfflineCollectionRequest cancellation) { }
