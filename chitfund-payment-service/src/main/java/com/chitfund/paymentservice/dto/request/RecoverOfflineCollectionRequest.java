package com.chitfund.paymentservice.dto.request;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
public record RecoverOfflineCollectionRequest(@NotNull UUID originalActorId, @NotNull @Valid RecordPaymentRequest original) { }
