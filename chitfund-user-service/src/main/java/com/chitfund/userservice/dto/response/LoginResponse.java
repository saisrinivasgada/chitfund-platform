package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Universal login response. Discriminated by requiresTenantSelection:
 * - false + authResponse present: SUPER_ADMIN or direct-scoped login (no picker needed)
 * - true + loginToken + tenants present: user must select a tenant
 */
@Data
@Builder
public class LoginResponse {
    private boolean requiresTenantSelection;

    // Populated when requiresTenantSelection = true
    private String loginToken;
    private List<TenantInfo> tenants;

    // Populated when requiresTenantSelection = false
    private AuthResponse authResponse;
}
