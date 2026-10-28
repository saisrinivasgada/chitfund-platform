package com.chitfund.paymentservice.dto.request;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.UUID;
public record RecoverOfflineStaffActionRequest(@NotNull UUID originalActorId,
        @NotBlank @Pattern(regexp = "STAFF|MANAGER") String originalRole,
        @NotNull @Valid OfflineStaffActionRequest original) { }
