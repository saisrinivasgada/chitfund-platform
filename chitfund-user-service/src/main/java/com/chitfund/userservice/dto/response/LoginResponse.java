package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Universal login response. Discriminated by requiresTenantSelection / requiresOtp:
 * - requiresOtp = true: ADMIN/MANAGER/SUPER_ADMIN must verify a phone OTP before getting tokens
 * - requiresTenantSelection = true: user must pick a tenant after OTP (or after password for MEMBER/STAFF)
 * - requiresTenantSelection = false + authResponse present: SUPER_ADMIN direct login
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

    // Populated when OTP step is required (ADMIN/MANAGER/SUPER_ADMIN with phone)
    private boolean requiresOtp;
    private String otpToken;
    private String maskedPhone;

    // Populated after OTP verified with rememberDevice=true (web only)
    private String deviceToken;
}
