package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.MemberUserLink;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AppAccessGrantService {

    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;
    private final PasswordEncoder passwordEncoder;

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
            // Never touch an ADMIN or WORKER account's has_app_access even if they were
            // incorrectly linked by old data.
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

    private User createMemberUser(String phone, String countryCode) {
        String base = "m" + phone.replaceAll("[^0-9]", "");
        if (base.length() > 45) base = base.substring(0, 45);
        String username = base;
        int suffix = 1;
        while (userRepository.existsByUsername(username)) {
            username = base + suffix++;
        }
        User u = User.builder()
                .username(username)
                .phone(phone)
                .phoneCountryCode(countryCode)
                .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                .role(Role.MEMBER)
                .hasAppAccess(false) // set to true by caller after this returns
                .mustChangePassword(true)
                .build();
        return userRepository.save(u);
    }
}
