package com.chitfund.supportservice.dto.request;

import lombok.Data;

@Data
public class UpdateIdentityPermissionsRequest {
    private boolean canManageIdentityCases;
}
