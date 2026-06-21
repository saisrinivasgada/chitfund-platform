package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * Returned on successful login, register, and token refresh.
 *
 * WHY include both accessToken and refreshToken?
 * - Access token: short-lived (15 min), sent on every API request
 * - Refresh token: long-lived (7 days), used ONLY to get a new access token
 * - Client stores refresh token securely (HttpOnly cookie or secure storage)
 * - When access token expires, client calls /api/auth/refresh with refresh token
 *
 * WHY expiresIn (seconds)?
 * - Client can calculate exact expiry time and proactively refresh before it hits
 * - Standard OAuth 2.0 field — React/mobile clients know to look for this
 * - tokenType "Bearer" is the OAuth 2.0 standard prefix for the Authorization header
 */
@Data
@Builder
public class AuthResponse {
    private String accessToken;
    private String refreshToken;
    private String tokenType;     // always "Bearer"
    private long expiresIn;       // access token TTL in seconds
    private UserResponse user;
    // Non-null only when admin creates/resets a member account — shown once, never stored
    private String tempPassword;
}
