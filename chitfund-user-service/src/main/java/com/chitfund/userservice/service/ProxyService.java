package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.MemberUserLink;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.response.ProxyTokenResponse;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProxyService {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;
    private final JwtTokenProvider jwtTokenProvider;

    public ProxyTokenResponse generateProxyToken(UUID tenantId, String roleStr, UUID userId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Tenant not found"));

        Role targetRole = Role.valueOf(roleStr.toUpperCase());

        User user;
        String memberId = null;

        if (userId != null) {
            user = userRepository.findById(userId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "User not found"));
            if (targetRole == Role.MEMBER) {
                MemberUserLink link = memberLinkRepository.findByUserIdAndTenantId(userId, tenantId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Member link not found"));
                memberId = link.getMemberId().toString();
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

        String token = jwtTokenProvider.generateScopedToken(
                user,
                tenantId.toString(),
                tenant.getSlug(),
                tenant.getPlan() != null ? tenant.getPlan() : "BASIC",
                tenant.getStatus() != null ? tenant.getStatus() : "ACTIVE",
                targetRole.name(),
                memberId
        );

        return ProxyTokenResponse.builder()
                .token(token)
                .proxyUserId(user.getId().toString())
                .proxyUsername(user.getUsername())
                .proxyRole(targetRole.name())
                .tenantId(tenantId.toString())
                .tenantSlug(tenant.getSlug())
                .planExpiresAt(tenant.getPlanExpiresAt())
                .build();
    }
}
