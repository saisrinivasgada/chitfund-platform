package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.MemberUserLink;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AppAccessGrantService {

    private final OtpService otpService;
    private final UserRepository userRepository;
    private final MemberUserLinkRepository memberLinkRepository;
    private final PasswordEncoder passwordEncoder;

    /**
     * Sends an OTP to the member's registered phone.
     * Admin will ask the member to read out the code, then call verifyAndGrant.
     *
     * @return masked phone string (e.g. "+91 ●●●●●●1234")
     */
    @Transactional
    public String sendOtp(String phone, String phoneCountryCode, UUID memberId) {
        String cc = phoneCountryCode != null ? phoneCountryCode : "+91";
        otpService.sendOtp(phone, cc, "APP_ACCESS", memberId.toString());
        // Return masked phone for display
        String digits = phone.replaceAll("[^0-9]", "");
        String visible = digits.length() >= 4 ? digits.substring(digits.length() - 4) : digits;
        return cc + " ●●●●●●" + visible;
    }

    /**
     * Verifies the OTP entered by the admin (which the member read out).
     * If verification passes, creates or reactivates the member's app access for this tenant.
     */
    @Transactional
    public UUID verifyAndGrant(String phone, String phoneCountryCode, UUID memberId,
                                UUID tenantId, String otp) {
        String cc = phoneCountryCode != null ? phoneCountryCode : "+91";
        otpService.verifyOtp(phone, "APP_ACCESS", memberId.toString(), otp);

        // Find or create user by phone — only reuse MEMBER-role accounts;
        // never link an ADMIN or WORKER account as a member even if they share the same phone.
        List<User> existing = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(phone, cc);
        User user;
        user = existing.stream()
                .filter(u -> u.getRole() == Role.MEMBER)
                .findFirst()
                .orElseGet(() -> createMemberUser(phone, cc));

        user.setHasAppAccess(true);
        userRepository.save(user);

        // Create or update the member_user_links row
        MemberUserLink link = memberLinkRepository
                .findByMemberIdAndTenantId(memberId, tenantId)
                .orElse(null);

        if (link != null) {
            if (!link.getUserId().equals(user.getId())) {
                // Phone was reassigned to a different user — update the link
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                        "This member's phone is already linked to a different account. Revoke first.",
                        HttpStatus.CONFLICT);
            }
        } else {
            // Check if this user is already linked to a different member in this org
            memberLinkRepository.findByUserIdAndTenantId(user.getId(), tenantId)
                    .ifPresent(existing2 -> {
                        if (!existing2.getMemberId().equals(memberId)) {
                            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                                    "This phone number is already linked to a different member in this organisation",
                                    HttpStatus.CONFLICT);
                        }
                        // Same member — link already exists, nothing to do
                    });

            // Only create if no link exists after the check above
            if (memberLinkRepository.findByUserIdAndTenantId(user.getId(), tenantId).isEmpty()) {
                MemberUserLink newLink = MemberUserLink.builder()
                        .userId(user.getId())
                        .tenantId(tenantId)
                        .memberId(memberId)
                        .build();
                memberLinkRepository.save(newLink);
            }
        }

        log.info("App access granted for member {} in tenant {} (userId={})", memberId, tenantId, user.getId());
        return user.getId();
    }

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
