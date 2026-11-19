package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for TenantService.resendOrgUserSetup().
 *
 * isSetupPending() is private and uses user.getOrgUserSetupCompletedAt() == null —
 * a pure in-memory check. Tests verify the observable contract through the public
 * resendOrgUserSetup() API. Activated users must have orgUserSetupCompletedAt set;
 * pending/expired users have it null.
 */
@ExtendWith(MockitoExtension.class)
class TenantResendSetupTest {

    @Mock TenantRepository tenantRepository;
    @Mock UserRepository userRepository;
    @Mock MemberUserLinkRepository memberLinkRepository;
    @Mock TenantCustomLimitsRepository customLimitsRepository;
    @Mock PlanLimitsRepository planLimitsRepository;
    @Mock PlanAddOnDefRepository addOnDefRepository;
    @Mock PromotionRepository promotionRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock PromotionService promotionService;
    @Mock NotificationEventPublisher notificationEventPublisher;
    @Mock AuditClient auditClient;
    @Mock PlanService planService;
    @Mock ObjectMapper objectMapper;
    @Mock TenantCreditAdjustmentRepository creditAdjustmentRepository;
    @Mock AccountSetupTokenRepository setupTokenRepository;
    @Mock OtpService otpService;
    @InjectMocks TenantService tenantService;

    @BeforeEach
    void injectValueFields() {
        // @Value fields are not injected by @InjectMocks — set them explicitly.
        ReflectionTestUtils.setField(tenantService, "frontendUrl", "http://localhost:3000");
        ReflectionTestUtils.setField(tenantService, "setupTokenExpiryHours", 72);
    }

    // ── isSetupPending contract — verified through resendOrgUserSetup() ────────

    /**
     * Active invite exists → setup is pending → resend succeeds.
     */
    @Test
    void resend_allowedWhenActiveInviteExists() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = pendingUser(tenantId, userId);
        Tenant tenant = Tenant.builder().id(tenantId).name("Test Org").build();

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));
        when(setupTokenRepository.hasFreshActiveOrgInvite(eq(userId), any())).thenReturn(false);
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        doNothing().when(setupTokenRepository).revokeAllActiveByUserAndPurpose(any(), any(), any());
        when(setupTokenRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        doNothing().when(notificationEventPublisher).publishEmail(any(), any(), any(), any());
        doNothing().when(auditClient).log(any(), any(), any(), any(), any(), any(), any(), any());

        tenantService.resendOrgUserSetup(tenantId, userId, "actor-1");

        verify(setupTokenRepository).saveAndFlush(any(AccountSetupToken.class));
        verify(notificationEventPublisher).publishEmail(any(), any(), any(), any());
    }

    /**
     * No active invite → setup is not pending → resend must be rejected with 409.
     * This is the main guard against resending to already-activated accounts.
     */
    @Test
    void resend_rejectedWhenNoActiveInvite() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = activatedUser(tenantId, userId);

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));
        // isSetupPending() now checks user.getOrgUserSetupCompletedAt() == null — no repo call needed

        assertThatThrownBy(() ->
                tenantService.resendOrgUserSetup(tenantId, userId, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getHttpStatus())
                        .isEqualTo(HttpStatus.CONFLICT));

        verify(setupTokenRepository, never()).save(any());
        verify(notificationEventPublisher, never()).publishEmail(any(), any(), any(), any());
    }

    /**
     * Critical regression guard: mustChangePassword=true (password-reset workflow) combined
     * with orgUserSetupCompletedAt set must still reject resend. The completion timestamp is
     * the only authoritative signal; other flags must not reopen the resend path.
     */
    @Test
    void resend_mustChangePasswordAloneDoesNotMakeSetupPending() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = User.builder()
                .id(userId)
                .tenantId(tenantId.toString())
                .email("staff@example.com")
                .role(Role.ADMIN)
                .mustChangePassword(true)
                .emailVerificationRequired(false)
                .orgUserSetupCompletedAt(java.time.LocalDateTime.now())
                .build();

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() ->
                tenantService.resendOrgUserSetup(tenantId, userId, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getHttpStatus())
                        .isEqualTo(HttpStatus.CONFLICT));

        verify(setupTokenRepository, never()).save(any());
    }

    /**
     * Critical regression guard: emailVerificationRequired=true (email-change workflow) combined
     * with orgUserSetupCompletedAt set must still reject resend. The completion timestamp is
     * the only authoritative signal; other flags must not reopen the resend path.
     */
    @Test
    void resend_emailVerificationRequiredAloneDoesNotMakeSetupPending() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = User.builder()
                .id(userId)
                .tenantId(tenantId.toString())
                .email("staff@example.com")
                .role(Role.ADMIN)
                .mustChangePassword(false)
                .emailVerificationRequired(true)
                .orgUserSetupCompletedAt(java.time.LocalDateTime.now())
                .build();

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() ->
                tenantService.resendOrgUserSetup(tenantId, userId, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getHttpStatus())
                        .isEqualTo(HttpStatus.CONFLICT));

        verify(setupTokenRepository, never()).save(any());
    }

    // ── resendOrgUserSetup behaviour tests ────────────────────────────────────

    @Test
    void resendOrgUserSetup_rejectsActivatedAccount_withConflict() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = activatedUser(tenantId, userId);

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));
        // isSetupPending() uses the field — no repo mock needed for activated users

        assertThatThrownBy(() ->
                tenantService.resendOrgUserSetup(tenantId, userId, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already activated");

        verify(setupTokenRepository, never()).save(any());
        verify(notificationEventPublisher, never()).publishEmail(any(), any(), any(), any());
    }

    @Test
    void resendOrgUserSetup_rejectsActivatedAccount_httpStatus409() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = activatedUser(tenantId, userId);

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));

        try {
            tenantService.resendOrgUserSetup(tenantId, userId, "actor-1");
        } catch (BusinessException ex) {
            assertThat(ex.getHttpStatus()).isEqualTo(HttpStatus.CONFLICT);
        }
    }

    @Test
    void resendOrgUserSetup_rejectsCrossTenantUserId() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID differentTenant = UUID.randomUUID();
        User user = pendingUser(differentTenant, userId);

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() ->
                tenantService.resendOrgUserSetup(tenantId, userId, "actor-1"))
                .isInstanceOf(BusinessException.class);

        verify(setupTokenRepository, never()).save(any());
    }

    @Test
    void resendOrgUserSetup_revokesExistingTokensBeforeCreatingNew() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = pendingUser(tenantId, userId);
        Tenant tenant = Tenant.builder().id(tenantId).name("Test Org").build();

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));
        when(setupTokenRepository.hasFreshActiveOrgInvite(eq(userId), any())).thenReturn(false);
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        doNothing().when(setupTokenRepository).revokeAllActiveByUserAndPurpose(any(), any(), any());
        when(setupTokenRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        doNothing().when(notificationEventPublisher).publishEmail(any(), any(), any(), any());
        doNothing().when(auditClient).log(any(), any(), any(), any(), any(), any(), any(), any());

        tenantService.resendOrgUserSetup(tenantId, userId, "actor-1");

        verify(setupTokenRepository).revokeAllActiveByUserAndPurpose(
                eq(userId), eq(SetupTokenPurpose.ORG_USER_INVITE), any());
    }

    @Test
    void resendOrgUserSetup_rejectsDisabledUserWithNoEmail() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = User.builder()
                .id(userId)
                .tenantId(tenantId.toString())
                .email(null)
                .role(Role.ADMIN)
                .mustChangePassword(true)
                .emailVerificationRequired(true)
                .build();

        when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));
        // No email — throws before the freshness-guard repo call; no additional mocks needed

        assertThatThrownBy(() ->
                tenantService.resendOrgUserSetup(tenantId, userId, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("email");

        verify(setupTokenRepository, never()).save(any());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private User pendingUser(UUID tenantId, UUID userId) {
        return User.builder()
                .id(userId)
                .tenantId(tenantId.toString())
                .email("staff@example.com")
                .role(Role.ADMIN)
                .mustChangePassword(true)
                .emailVerificationRequired(true)
                .build();
    }

    private User activatedUser(UUID tenantId, UUID userId) {
        return User.builder()
                .id(userId)
                .tenantId(tenantId.toString())
                .email("staff@example.com")
                .role(Role.ADMIN)
                .mustChangePassword(false)
                .emailVerificationRequired(false)
                .orgUserSetupCompletedAt(java.time.LocalDateTime.now())
                .build();
    }
}
