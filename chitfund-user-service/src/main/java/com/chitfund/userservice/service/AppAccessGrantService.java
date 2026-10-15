package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AppAccessGrantService {

    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;

    /**
     * Revokes app access for a member in a specific tenant.
     * If no other tenant grants remain, also clears has_app_access on the user.
     */
    @Transactional
    public void revokeAccess(UUID memberId, UUID tenantId) {
        memberLinkRepository.findByMemberIdAndTenantId(memberId, tenantId).ifPresent(link -> {
            UUID userId = link.getUserId();
            memberLinkRepository.delete(link);

            // If no other org links remain, revoke the login gate — but only for MEMBER accounts.
            if (!memberLinkRepository.existsByUserId(userId)) {
                userRepository.findById(userId).ifPresent(u -> {
                    if (u.getRole() == Role.MEMBER) {
                        u.setHasAppAccess(false);
                        userRepository.save(u);
                    }
                });
            }
            log.info("App access revoked for member {} in tenant {} (userId={})", memberId, tenantId, userId);
        });
    }
}
