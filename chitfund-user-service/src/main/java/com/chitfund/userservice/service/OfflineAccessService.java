package com.chitfund.userservice.service;

import com.chitfund.common.offline.OfflineAccessTokens;
import com.chitfund.common.offline.OfflineReconciliationRequest;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.response.TenantInfo;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

import java.time.Clock;
import java.time.ZoneOffset;
import org.springframework.http.HttpStatus;

@Service
public class OfflineAccessService {
    private final TenantService tenantService;
    private final OfflineAccessTokens tokens;

    public record Access(boolean enabled, String reason, String tenantId, String actorId,
                         String role, long serverTime, OfflineAccessTokens.Grant grant) { }

    @Autowired
    public OfflineAccessService(TenantService tenantService,
            @Value("${offline.signing-secret:}") String secret,
            @Value("${offline.signing-key-id:v1}") String keyId,
            @Value("${offline.previous-signing-keys:}") String retainedKeys,
            @Value("${offline.legacy-signing-secret:}") String legacySecret) {
        this(tenantService, new OfflineAccessTokens(keyId, secret, parseRetainedKeys(retainedKeys), legacySecret, Clock.systemUTC()));
    }

    private static Map<String, String> parseRetainedKeys(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try { return new ObjectMapper().readValue(json, new TypeReference<Map<String, String>>() {}); }
        catch (Exception invalid) { throw new IllegalArgumentException("Offline verification-key configuration is invalid"); }
    }

    OfflineAccessService(TenantService tenantService, OfflineAccessTokens tokens) {
        this.tenantService = tenantService;
        this.tokens = tokens;
    }

    @Transactional(readOnly = true)
    public Access issue(User actor, String tenantId) {
        String actorId = actor.getId().toString();
        TenantInfo tenant = tenantService.buildTenantInfoList(actor.getId()).stream()
                .filter(item -> tenantId.equals(item.getTenantId())).findFirst().orElse(null);
        String role = tenant == null ? actor.getRole().name() : tenant.getRole();
        if (!actor.isEnabled() || actor.isLocked() || actor.getDeletedAt() != null
                || actor.isMustChangePassword() || !actor.isHasAppAccess() || tenant == null) {
            return denied("ACCOUNT_ACCESS_REQUIRED", tenantId, actorId, role);
        }
        if (!"ACTIVE".equals(tenant.getStatus())) {
            return denied("ORGANISATION_INACTIVE", tenantId, actorId, role);
        }
        if (!tenant.isOfflineEnabled()) return denied("ADD_ON_REQUIRED", tenantId, actorId, role);
        if (!tokens.canIssue()) return denied("OFFLINE_NOT_CONFIGURED", tenantId, actorId, role);
        try {
            var expiry = tenant.getPlanExpiresAt() == null ? null
                    : tenant.getPlanExpiresAt().toInstant(ZoneOffset.UTC);
            var grant = tokens.issue(actorId, tenantId, role, expiry);
            String reason = grant.recordUntil() <= grant.issuedAt() ? "SUBSCRIPTION_EXPIRED" : null;
            return new Access(true, reason, tenantId, actorId, role, grant.issuedAt(), grant);
        } catch (IllegalArgumentException unavailable) {
            return denied("OFFLINE_ACCESS_EXPIRED", tenantId, actorId, role);
        }
    }

    private Access denied(String reason, String tenantId, String actorId, String role) {
        return new Access(false, reason, tenantId, actorId, role, System.currentTimeMillis(), null);
    }

    @Transactional(readOnly = true)
    public OfflineAccessTokens.Grant authorizeRecordedAction(User actor, OfflineReconciliationRequest request) {
        String actorId = actor.getId().toString();
        TenantInfo tenant = tenantService.buildTenantInfoList(actor.getId()).stream()
                .filter(item -> item.getTenantId().equals(request.tenantId())).findFirst().orElse(null);
        if (!actorId.equals(request.actorId()) || tenant == null
                || !actor.isEnabled() || actor.isLocked() || actor.getDeletedAt() != null
                || actor.isMustChangePassword() || !actor.isHasAppAccess()
                || !"ACTIVE".equals(tenant.getStatus()) || !tenant.getRole().equals(request.role())) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Saved payment needs account access restored before it can sync. It remains on the device.",
                    HttpStatus.FORBIDDEN);
        }
        // Expiry/downgrade stops new grants, but must not stop delivery of work
        // recorded under a previous grant. Current account access still applies.
        try {
            return tokens.verifyRecordedAction(request.token(), actorId, request.tenantId(),
                    request.role(), request.action(), request.recordedAt());
        } catch (io.jsonwebtoken.JwtException | IllegalArgumentException invalid) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Saved payment authorisation could not be verified. The payment needs review and remains on the device.",
                    HttpStatus.FORBIDDEN);
        }
    }
}
