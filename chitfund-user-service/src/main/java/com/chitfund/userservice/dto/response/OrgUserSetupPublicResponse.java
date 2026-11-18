package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class OrgUserSetupPublicResponse {
    private String username;
    private String maskedEmail;
    private String orgName;
    private String role;
    private boolean expired;
    private boolean used;
}
