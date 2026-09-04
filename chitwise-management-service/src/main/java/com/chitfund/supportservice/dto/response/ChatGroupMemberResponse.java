package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class ChatGroupMemberResponse {
    private String userId;
    private String userName;
    private String role;
    private Instant joinedAt;
}
