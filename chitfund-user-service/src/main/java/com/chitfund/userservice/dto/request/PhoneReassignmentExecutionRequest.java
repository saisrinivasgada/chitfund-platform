package com.chitfund.userservice.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;
import java.util.List;
import java.util.UUID;

@Data
public class PhoneReassignmentExecutionRequest {
    @NotBlank @Size(max = 80) private String operationId;
    @NotNull private UUID oldUserId;
    @NotBlank @Size(max = 10) private String phoneCountryCode;
    @NotBlank @Pattern(regexp = "^\\d{7,15}$") private String phone;
    @NotBlank @Email @Size(max = 255) private String email;
    @NotEmpty @Valid private List<MemberLink> approvedMemberLinks;

    @Data
    public static class MemberLink {
        @NotNull private UUID tenantId;
        @NotNull private UUID memberId;
    }
}
