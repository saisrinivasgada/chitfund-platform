package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class SwapSlotsRequest {

    @NotNull(message = "Slot A ID is required")
    private UUID slotAId;

    @NotNull(message = "Slot B ID is required")
    private UUID slotBId;
}
