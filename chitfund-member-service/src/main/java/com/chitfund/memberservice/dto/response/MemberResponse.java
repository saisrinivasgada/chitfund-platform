package com.chitfund.memberservice.dto.response;

import com.chitfund.memberservice.domain.enums.MemberStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class MemberResponse {

    private UUID id;
    private String fullName;
    private String phone;
    private String phoneCountryCode;
    private String email;
    private String address;
    private String city;
    private String aadhaarLast4;
    private String panNumber;
    private String bankName;
    private String bankAccountNumber;
    private String bankIfsc;
    private MemberStatus status;
    private UUID userId;            // null if member has no app login
    private boolean hasAppAccess;   // convenience flag: userId != null
    private String setupToken;      // only present on initial member creation (new user was auto-created)
    private String notes;
    private UUID referredById;
    private String referredByName;
    private UUID createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;
    private UUID deletedBy;
}
