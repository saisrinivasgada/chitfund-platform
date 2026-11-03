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

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for TenantService.resendOrgUserSetup() activation guard and
 * the isSetupPending() helper.
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
    @InjectMocks TenantService tenantService;

    // ── isSetupPending helper ─────────────────────────────────────────────────

    @Test
    void isSetupPending_returnsTrueWhenMustChangePasswordSet() {
        User u = User.builder().mustChangePassword(true).emailVerificationRequired(false).build();
        assertThat(TenantService.isSetupPending(u)).isTrue();
    }

    @Test
    void isSetupPending_returnsTrueWhenEmailVerificationRequired() {
        User u = User.builder().mustChangePassword(false).emailVerificationRequired(true).build();
        assertThat(TenantService.isSetupPending(u)).isTrue();
    }

    @Test
    void isSetupPending_returnsTrueWhenBothSet() {
        User u = User.builder().mustChangePassword(true).emailVerificationRequired(true).build();
        assertThat(TenantService.isSetupPending(u)).isTrue();
    }

    @Test
    void isSetupPending_returnsFalseWhenBothClear() {
        User u = User.builder().mustChangePassword(false).emailVerificationRequired(false).build();
        assertThat(TenantService.isSetupPending(u)).isFalse();
    }

    // ── resendOrgUserSetup guard ──────────────────────────────────────────────

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
                .build();
    }

    @Test
    void resendOrgUserSetup_succeedsForPendingAccount() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = pendingUser(tenantId, userId);
        Tenant tenant = Tenant.builder().id(tenantId).name("Test Org").build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(setupTokenRepository.findAllByUserIdAndPurposeAndUsedAtIsNull(
                userId, SetupTokenPurpose.ORG_USER_INVITE)).thenReturn(List.of());
        when(setupTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        doNothing().when(notificationEventPublisher).publishEmail(any(), any(), any(), any());
        doNothing().when(auditClient).log(any(), any(), any(), any(), any(), any(), any(), any());

        tenantService.resendOrgUserSetup(tenantId, userId, "actor-1");

        verify(setupTokenRepository).save(any(AccountSetupToken.class));
        verify(notificationEventPublisher).publishEmail(any(), any(), any(), any());
    }

    @Test
    void resendOrgUserSetup_rejectsActivatedAccount_withConflict() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = activatedUser(tenantId, userId);

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

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

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

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

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

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

        AccountSetupToken oldToken = AccountSetupToken.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .build();

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(setupTokenRepository.findAllByUserIdAndPurposeAndUsedAtIsNull(
                userId, SetupTokenPurpose.ORG_USER_INVITE)).thenReturn(List.of(oldToken));
        when(setupTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        doNothing().when(notificationEventPublisher).publishEmail(any(), any(), any(), any());
        doNothing().when(auditClient).log(any(), any(), any(), any(), any(), any(), any(), any());

        tenantService.resendOrgUserSetup(tenantId, userId, "actor-1");

        assertThat(oldToken.getUsedAt()).isNotNull();
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

        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() ->
                tenantService.resendOrgUserSetup(tenantId, userId, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("email");

        verify(setupTokenRepository, never()).save(any());
    }
}
