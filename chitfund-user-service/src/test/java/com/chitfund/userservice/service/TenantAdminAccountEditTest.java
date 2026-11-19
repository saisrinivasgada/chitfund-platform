package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for super-admin admin-account edit operations:
 * updateAdminName, updateAdminEmail, sendAdminPhoneUpdateOtp, verifyAdminPhoneUpdate.
 */
@ExtendWith(MockitoExtension.class)
class TenantAdminAccountEditTest {

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
        ReflectionTestUtils.setField(tenantService, "frontendUrl", "http://localhost:3000");
        ReflectionTestUtils.setField(tenantService, "setupTokenExpiryHours", 72);
        ReflectionTestUtils.setField(tenantService, "devOtpExposureEnabled", false);
        ReflectionTestUtils.setField(tenantService, "founderNotificationEmail", "founder@thechitwise.com");
        ReflectionTestUtils.setField(tenantService, "superAdminUrl", "http://localhost:3000");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private User setupPendingUser(UUID tenantId, UUID userId) {
        return User.builder()
                .id(userId)
                .tenantId(tenantId.toString())
                .role(Role.ADMIN)
                .fullName("Original Name")
                .email("admin@test.com")
                .phone("9876543210")
                .phoneCountryCode("+91")
                .orgUserSetupCompletedAt(null) // setup pending
                .build();
    }

    private User activeUser(UUID tenantId, UUID userId) {
        return User.builder()
                .id(userId)
                .tenantId(tenantId.toString())
                .role(Role.ADMIN)
                .fullName("Active Admin")
                .email("active@test.com")
                .phone("9876543210")
                .phoneCountryCode("+91")
                .orgUserSetupCompletedAt(LocalDateTime.now().minusDays(1))
                .build();
    }

    // ── updateAdminName ───────────────────────────────────────────────────────

    @Test
    void updateAdminName_updatesNameAndAudits() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        tenantService.updateAdminName(tenantId, userId, "New Name", "actor-1");

        assertThat(user.getFullName()).isEqualTo("New Name");
        verify(userRepository).save(user);
        verify(auditClient).log(eq("USER"), eq(userId.toString()), eq("ADMIN_NAME_UPDATED"),
                eq("actor-1"), eq("ROLE_SUPER_ADMIN"), any(), any(), eq(tenantId.toString()));
    }

    @Test
    void updateAdminName_trimsWhitespace() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        tenantService.updateAdminName(tenantId, userId, "  Trimmed Name  ", "actor-1");

        assertThat(user.getFullName()).isEqualTo("Trimmed Name");
    }

    @Test
    void updateAdminName_rejectsBlankName() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        assertThatThrownBy(() -> tenantService.updateAdminName(tenantId, userId, "   ", "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Full name is required");
    }

    @Test
    void updateAdminName_rejectsCrossTenantUser() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(UUID.randomUUID(), userId); // different tenant
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> tenantService.updateAdminName(tenantId, userId, "New Name", "actor-1"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void updateAdminName_rejectsUnknownUser() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tenantService.updateAdminName(tenantId, userId, "Name", "actor-1"))
                .isInstanceOf(BusinessException.class);
    }

    // ── updateAdminEmail ──────────────────────────────────────────────────────

    @Test
    void updateAdminEmail_updatesEmailForSetupPendingUser() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.existsByEmail("newemail@test.com")).thenReturn(false);

        tenantService.updateAdminEmail(tenantId, userId, "newemail@test.com", "actor-1");

        assertThat(user.getEmail()).isEqualTo("newemail@test.com");
        verify(userRepository).save(user);
        verify(auditClient).log(eq("USER"), eq(userId.toString()), eq("ADMIN_EMAIL_CORRECTED"),
                eq("actor-1"), eq("ROLE_SUPER_ADMIN"), any(), any(), eq(tenantId.toString()));
    }

    @Test
    void updateAdminEmail_normalisesToLowercase() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.existsByEmail("upper@test.com")).thenReturn(false);

        tenantService.updateAdminEmail(tenantId, userId, "UPPER@test.com", "actor-1");

        assertThat(user.getEmail()).isEqualTo("upper@test.com");
    }

    @Test
    void updateAdminEmail_rejectsActiveAccount() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = activeUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> tenantService.updateAdminEmail(tenantId, userId, "new@test.com", "actor-1"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getHttpStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void updateAdminEmail_rejectsDuplicateEmail() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.existsByEmail("taken@test.com")).thenReturn(true);

        assertThatThrownBy(() -> tenantService.updateAdminEmail(tenantId, userId, "taken@test.com", "actor-1"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void updateAdminEmail_allowsSameEmail_noConflictCheck() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId); // email = "admin@test.com"
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        // Submitting the same email — existsByEmail should NOT be called (no need to validate uniqueness)
        tenantService.updateAdminEmail(tenantId, userId, "admin@test.com", "actor-1");

        verify(userRepository, never()).existsByEmail(any());
        verify(userRepository).save(user);
    }

    // ── sendAdminPhoneUpdateOtp ───────────────────────────────────────────────

    @Test
    void sendAdminPhoneUpdateOtp_delegatesToOtpService() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(otpService.sendOtp("9999999999", "+91", "SUPER_ADMIN_PHONE_UPDATE", userId.toString()))
                .thenReturn(null);

        tenantService.sendAdminPhoneUpdateOtp(tenantId, userId, "9999999999", "+91", "actor-1");

        verify(otpService).sendOtp("9999999999", "+91", "SUPER_ADMIN_PHONE_UPDATE", userId.toString());
    }

    @Test
    void sendAdminPhoneUpdateOtp_returnDevOtpWhenEnabled() {
        ReflectionTestUtils.setField(tenantService, "devOtpExposureEnabled", true);
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(otpService.sendOtp(any(), any(), any(), any())).thenReturn("123456");

        String devOtp = tenantService.sendAdminPhoneUpdateOtp(tenantId, userId, "9999999999", "+91", "actor-1");

        assertThat(devOtp).isEqualTo("123456");
    }

    @Test
    void sendAdminPhoneUpdateOtp_rejectsCrossTenantUser() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(UUID.randomUUID(), userId); // different tenant
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> tenantService.sendAdminPhoneUpdateOtp(tenantId, userId, "9999999999", "+91", "actor-1"))
                .isInstanceOf(BusinessException.class);
    }

    // ── verifyAdminPhoneUpdate ────────────────────────────────────────────────

    @Test
    void verifyAdminPhoneUpdate_savesPhoneAndAuditsOnSuccess() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(otpService.verifyOtp("9999999999", "SUPER_ADMIN_PHONE_UPDATE", userId.toString(), "123456"))
                .thenReturn("otp-record-id");

        tenantService.verifyAdminPhoneUpdate(tenantId, userId, "9999999999", "+91", "123456", "actor-1");

        assertThat(user.getPhone()).isEqualTo("9999999999");
        assertThat(user.getPhoneCountryCode()).isEqualTo("+91");
        verify(userRepository).save(user);
        verify(auditClient).log(eq("USER"), eq(userId.toString()), eq("ADMIN_PHONE_UPDATED"),
                eq("actor-1"), eq("ROLE_SUPER_ADMIN"), any(), any(), eq(tenantId.toString()));
    }

    @Test
    void verifyAdminPhoneUpdate_propagatesOtpFailure() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        doThrow(new BusinessException(com.chitfund.common.exception.ErrorCode.OTP_INVALID, "Incorrect OTP."))
                .when(otpService).verifyOtp("9999999999", "SUPER_ADMIN_PHONE_UPDATE", userId.toString(), "000000");

        assertThatThrownBy(() -> tenantService.verifyAdminPhoneUpdate(tenantId, userId, "9999999999", "+91", "000000", "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Incorrect OTP");

        verify(userRepository, never()).save(any());
    }

    @Test
    void verifyAdminPhoneUpdate_defaultsCountryCodeWhenNull() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User user = setupPendingUser(tenantId, userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(otpService.verifyOtp(any(), any(), any(), any())).thenReturn("otp-record-id");

        tenantService.verifyAdminPhoneUpdate(tenantId, userId, "9999999999", null, "123456", "actor-1");

        assertThat(user.getPhoneCountryCode()).isEqualTo("+91");
    }
}
