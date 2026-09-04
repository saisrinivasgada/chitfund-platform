package com.chitfund.chitservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class SlotInfo {
    private int monthNumber;
    private LocalDate reservationMonth;
    /** AVAILABLE | RESERVED_BY_ME | RESERVED_BY_OTHER */
    private String slotStatus;
    private UUID reservationId;
}
