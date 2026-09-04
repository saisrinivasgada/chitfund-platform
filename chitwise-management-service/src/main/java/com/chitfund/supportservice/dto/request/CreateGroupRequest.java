package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CreateGroupRequest {

    @NotBlank
    @Size(min = 2, max = 100)
    private String name;

    @Size(max = 500)
    private String description;

    /** Initial member userIds to add (besides the creator). Max 100. */
    @NotNull
    @Size(max = 100)
    private List<String> memberIds;

    /** Member names keyed by userId — used to populate member_name on ChatGroupMember. */
    @NotNull
    @Size(max = 100)
    private List<MemberInfo> members;

    @Data
    public static class MemberInfo {
        private String userId;
        private String userName;
        private String role;
    }
}
