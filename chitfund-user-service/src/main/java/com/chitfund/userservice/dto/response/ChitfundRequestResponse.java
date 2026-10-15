package com.chitfund.userservice.dto.response;

import com.chitfund.userservice.domain.enums.ChitfundRequestKind;
import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class ChitfundRequestResponse {
    private UUID id;
    private UUID tenantId;
    private UUID memberId;
    private String organizationName;
    private String maskedPhone;
    private String maskedEmail;
    private ChitfundRequestKind requestKind;
    private ChitfundRequestStatus status;
    private LocalDateTime expiresAt;
    private LocalDateTime memberVerifiedAt;
    private LocalDateTime adminConfirmedAt;
    private boolean emailVerified;
    private boolean phoneVerificationPending;
    /** "PENDING" | "SENT" | "FAILED" | "UNAVAILABLE" */
    private String setupEmailStatus;
    /** Backward-compat derived field: true only when setupEmailStatus == "SENT". */
    private boolean setupEmailSent;
    private String setupToken;
    private String actionToken;
}
