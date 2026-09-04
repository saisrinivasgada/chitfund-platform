package com.chitfund.supportservice.security;

import jakarta.servlet.http.HttpServletRequest;
import lombok.Getter;

/**
 * Extracts org-user identity from gateway-forwarded headers.
 * The API gateway validates the org JWT and forwards X-User-Id, X-User-Role, X-Tenant-Id.
 * Endpoints at /api/tickets/** trust these headers — the gateway is the auth boundary.
 */
@Getter
public class OrgRequestContext {

    private final String userId;
    private final String role;
    private final String tenantId;
    private final String userName;

    public OrgRequestContext(HttpServletRequest request) {
        this.userId = request.getHeader("X-User-Id");
        this.role = request.getHeader("X-User-Role");
        this.tenantId = request.getHeader("X-Tenant-Id");
        this.userName = request.getHeader("X-User-Name");
    }

    public boolean isValid() {
        return userId != null && role != null && tenantId != null;
    }

    public boolean isAdminOrManager() {
        return "ADMIN".equals(role) || "MANAGER".equals(role);
    }

    public boolean isAdminOnly() {
        return "ADMIN".equals(role);
    }
}
