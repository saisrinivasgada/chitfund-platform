package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Step 1 of multi-tenant login.
 * Frontend shows company picker if tenants.size() > 1, or auto-selects if size == 1.
 * Token is a short-lived (5-min) pre-scope JWT used only at /auth/select-tenant.
 */
@Data
@Builder
public class PreScopeAuthResponse {
    private String loginToken;      // 5-min pre-scope JWT
    private List<TenantInfo> tenants;
}
