package com.chitfund.userservice.dto.response;

import com.fasterxml.jackson.annotation.JsonRawValue;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class ReminderResponse {
    private UUID id;
    private UUID senderId;
    private String senderName;
    private UUID memberUserId;
    private UUID memberProfileId;
    private String message;

    @JsonRawValue
    private String chitDetails;

    // JSON array: [{date, setAt}]
    @JsonRawValue
    private String promisedDateHistory;

    private BigDecimal totalAmount;
    private Integer repeatIntervalMinutes;
    private String reminderTime;
    private LocalDateTime sentAt;
    private LocalDateTime seenAt;
    private LocalDateTime readAt;
    private LocalDate promisedDate;
    private boolean archived;
    private LocalDateTime archivedAt;

    // Convenience flags for frontend
    public boolean isRead() { return readAt != null; }
    public boolean isSeen() { return seenAt != null; }
}
