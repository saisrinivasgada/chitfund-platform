package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class PrepareIdentityCaseRequest {
    @NotBlank @Size(max = 5000)
    private String reason;
    @Size(max = 36)
    private String oldUserId;
    @Size(max = 10)
    private String phoneCountryCode;
    @Size(max = 15)
    private String phone;
    @Email @Size(max = 255)
    private String email;
    private List<MemberLink> approvedMemberLinks;

    @Data
    public static class MemberLink {
        @Size(max = 36) private String tenantId;
        @Size(max = 36) private String memberId;
    }
}
