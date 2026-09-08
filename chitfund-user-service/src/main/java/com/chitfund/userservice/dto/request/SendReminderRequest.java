package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class SendReminderRequest {

    @NotNull
    private UUID memberProfileId;

    private String message;

    private Integer repeatIntervalMinutes;

    /** HH:MM — used when repeatIntervalMinutes == 1440 (daily) to schedule at a specific time */
    private String reminderTime;

    @NotNull
    private List<ChitEntry> chits;

    @Data
    public static class ChitEntry {
        private String chitId;
        private String chitName;
        private Integer cycleNo;
        private BigDecimal installmentAmount;
    }
}
