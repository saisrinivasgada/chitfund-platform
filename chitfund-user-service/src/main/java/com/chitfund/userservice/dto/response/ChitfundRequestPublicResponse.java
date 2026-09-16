package com.chitfund.userservice.dto.response;

import com.chitfund.userservice.domain.enums.ChitfundRequestKind;
import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ChitfundRequestPublicResponse {
    private String organizationName;
    private String maskedPhone;
    private String maskedEmail;
    private ChitfundRequestKind requestKind;
    private ChitfundRequestStatus status;
    private LocalDateTime expiresAt;
    private boolean emailRecoveryAvailable;
}
