package com.chitfund.memberservice.dto.request;

import com.chitfund.memberservice.domain.enums.MemberStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateStatusRequest {

    @NotNull
    private MemberStatus status;

    // Required when blacklisting — forces admin to document why
    private String reason;
}
