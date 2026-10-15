package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.MemberUserLink;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.dto.response.ProxyTokenResponse;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProxyService {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuditClient auditClient;

    private static final Set<Role> PROXY_ROLES = Set.of(
            Role.ADMIN, Role.MANAGER, Role.STAFF, Role.MEMBER);

    @Transactional
    public ProxyTokenResponse generateProxyToken(UUID tenantId, String roleStr, UUID userId,
                                                 String actorId, String reason) {
        String auditReason = requireReason(reason);
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));

        Role targetRole;
        try {
            targetRole = Role.valueOf(roleStr == null ? "" : roleStr.trim().toUpperCase());
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Unsupported proxy role");
        }
        if (!PROXY_ROLES.contains(targetRole)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Super Admin and platform roles cannot be proxied");
        }

        User user;
        String memberId = null;

        if (userId != null) {
            user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "User not found"));
            if (targetRole == Role.MEMBER) {
                MemberUserLink link = memberLinkRepository.findByUserIdAndTenantId(userId, tenantId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Member link not found"));
                memberId = link.getMemberId().toString();
            } else if (!tenantId.toString().equals(user.getTenantId())) {
                throw new BusinessException(ErrorCode.FORBIDDEN,
                        "The selected user does not belong to this organization");
            }
        } else if (targetRole == Role.MEMBER) {
            // For MEMBER proxy: find via member_user_links
            List<MemberUserLink> links = memberLinkRepository.findAllByTenantId(tenantId);
            if (links.isEmpty()) {
                throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "No member found in this org");
            }
            MemberUserLink link = links.get(0);
            user = userRepository.findById(link.getUserId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "User not found"));
            memberId = link.getMemberId().toString();
        } else {
            // ADMIN / MANAGER / STAFF: role lives on users.role
            user = userRepository
                    .findByTenantIdAndRoleInAndDeletedAtIsNull(tenantId.toString(), List.of(targetRole))
                    .stream().findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                            "No user with role " + roleStr.toUpperCase() + " found in this org"));
        }

        if (user.getRole() != targetRole) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "The selected user does not have the requested role");
        }
        if (!user.isEnabled() || user.getDeletedAt() != null || user.isLocked()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "The selected user account is not available for proxy access");
        }

        String token = jwtTokenProvider.generateScopedToken(
                user,
                tenantId.toString(),
                tenant.getSlug(),
                tenant.getPlan() != null ? tenant.getPlan() : "BASIC",
                tenant.getStatus() != null ? tenant.getStatus() : "ACTIVE",
                targetRole.name(),
                memberId
        );

        ProxyTokenResponse response = ProxyTokenResponse.builder()
                .token(token)
                .proxyUserId(user.getId().toString())
                .proxyUsername(user.getUsername())
                .proxyRole(targetRole.name())
                .tenantId(tenantId.toString())
                .tenantSlug(tenant.getSlug())
                .planExpiresAt(tenant.getPlanExpiresAt())
                .build();
        auditClient.log("PROXY_SESSION", user.getId().toString(),
                "PROXY_TOKEN_ISSUED", actorId, "SUPER_ADMIN",
                null,
                Map.of("tenantId", tenantId.toString(),
                        "targetUserId", user.getId().toString(),
                        "targetRole", targetRole.name()),
                tenantId.toString(), "HUB", "SUCCESS", auditReason);
        return response;
    }

    private String requireReason(String reason) {
        if (reason == null || reason.trim().length() < 5) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A reason of at least 5 characters is required for proxy access");
        }
        return reason.trim();
    }
}
