package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.entity.RefreshToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.LoginRequest;
import com.chitfund.userservice.dto.request.RegisterRequest;
import com.chitfund.userservice.dto.request.SelectTenantRequest;
import com.chitfund.userservice.dto.response.TenantInfo;
import com.chitfund.common.context.TenantContext;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.TrustedDeviceRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.List;
import java.util.UUID;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock TrustedDeviceRepository trustedDeviceRepository;
    @Mock AccountSetupTokenRepository setupTokenRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtTokenProvider jwtTokenProvider;
    @Mock AuthenticationManager authenticationManager;
    @Mock UserMapper userMapper;
    @Mock TenantService tenantService;
    @Mock OtpService otpService;
    @Mock PasswordValidator passwordValidator;
    @Mock AccountEmailOtpService accountEmailOtpService;
    @Mock AuthenticationSecurityService authenticationSecurityService;
    @Mock PlanService planService;
    @InjectMocks AuthService authService;

    @AfterEach
    void clearTenantContext() {
        TenantContext.clear();
    }

    @Test
    void unknownUsernameReturnsGenericCredentialsErrorAndAuditsFingerprint() {
        LoginRequest request = new LoginRequest();
        request.setUsername("missing.user");
        request.setPassword("NotThePassword@1");
        when(userRepository.findByUsername("missing.user")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(request, null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Invalid credentials");

        verify(authenticationSecurityService).recordUnknownLoginAttempt("missing.user");
    }

    @Test
    void failedPasswordUsesIndependentSecurityTransaction() {
        User user = User.builder().id(UUID.randomUUID()).username("member.failed")
                .passwordHash("hash").role(Role.MEMBER).build();
        LoginRequest request = new LoginRequest();
        request.setUsername(user.getUsername());
        request.setPassword("WrongPassword@1");
        when(userRepository.findByUsername(user.getUsername())).thenReturn(Optional.of(user));
        when(authenticationManager.authenticate(any())).thenThrow(
                new org.springframework.security.authentication.BadCredentialsException("bad"));
        when(authenticationSecurityService.recordFailedLoginAttempt(user.getId())).thenReturn(false);

        assertThatThrownBy(() -> authService.login(request, null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Invalid credentials");

        verify(authenticationSecurityService).recordFailedLoginAttempt(user.getId());
    }

    @Test
    void concurrentAccountChangeIsNotCountedAsAnIncorrectPassword() {
        User user = User.builder().id(UUID.randomUUID()).username("staff.concurrent")
                .passwordHash("hash").role(Role.STAFF).build();
        LoginRequest request = new LoginRequest(); request.setUsername(user.getUsername()); request.setPassword("Correct@123");
        when(userRepository.findByUsername(user.getUsername())).thenReturn(Optional.of(user));
        when(authenticationManager.authenticate(any())).thenReturn(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
        when(userRepository.save(user)).thenThrow(
                new org.springframework.orm.ObjectOptimisticLockingFailureException(User.class, user.getId()));
        assertThatThrownBy(() -> authService.login(request, null))
                .isInstanceOf(org.springframework.orm.ObjectOptimisticLockingFailureException.class);
        verify(authenticationSecurityService, never()).recordFailedLoginAttempt(any());
    }

    @Test
    void revokedRefreshTokenReplayRevokesSessionsOutsideRejectedTransaction() {
        User user = User.builder().id(UUID.randomUUID()).username("member.replay")
                .role(Role.MEMBER).build();
        RefreshToken token = RefreshToken.builder().user(user).token("stored-hash")
                .expiresAt(LocalDateTime.now().plusDays(1)).revoked(true).build();
        when(refreshTokenRepository.findByToken(AuthService.sha256Value("replayed-token")))
                .thenReturn(Optional.of(token));

        assertThatThrownBy(() -> authService.refreshByToken("replayed-token"))
                .isInstanceOf(BusinessException.class);

        verify(authenticationSecurityService).recordRefreshTokenReplay(user.getId());
    }

    @Test
    void staffRegistrationChecksQuotaInsideTheRegistrationService() {
        String tenantId = UUID.randomUUID().toString();
        TenantContext.set(tenantId);
        RegisterRequest request = new RegisterRequest();
        request.setRole(Role.MANAGER);
        request.setUsername("new.manager");
        request.setEmail("manager@example.com");
        request.setFullName("New Manager");
        request.setPhone("9876543210");
        request.setPhoneCountryCode("+91");
        request.setPassword("StrongPassword@1");
        when(passwordEncoder.encode("StrongPassword@1")).thenReturn("encoded");

        authService.register(request, UUID.randomUUID());

        verify(planService).checkStaffLimit(tenantId);
        verify(userRepository).save(any(User.class));
    }

    @Test
    void regularLoginRejectsLegacySuperAdminAccount() {
        User user = User.builder()
                .username("owner")
                .passwordHash("old-hash")
                .role(Role.SUPER_ADMIN)
                .build();
        LoginRequest request = new LoginRequest();
        request.setUsername("owner");
        request.setPassword("Password@1");
        when(userRepository.findByUsername("owner")).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> authService.login(request, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ChitWise Hub");
        verify(authenticationManager, never()).authenticate(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void newlyCreatedOrganizationUserGetsNoAccessBeforeEmailOtpVerification() {
        User user = User.builder().id(UUID.randomUUID()).username("staff.one")
                .email("staff@example.com").fullName("Staff One")
                .passwordHash("hash").role(Role.STAFF)
                .emailVerificationRequired(true).build();
        LoginRequest request = new LoginRequest();
        request.setUsername(user.getUsername());
        request.setPassword("Password@1");
        when(userRepository.findByUsername(user.getUsername())).thenReturn(Optional.of(user));
        when(authenticationManager.authenticate(any())).thenReturn(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        user, null, user.getAuthorities()));
        when(jwtTokenProvider.generateEmailVerificationToken(user)).thenReturn("email-token");

        var result = authService.login(request, null);

        assertThat(result.isRequiresEmailVerification()).isTrue();
        assertThat(result.getEmailVerificationToken()).isEqualTo("email-token");
        assertThat(result.getAuthResponse()).isNull();
        assertThat(result.getLoginToken()).isNull();
        verify(accountEmailOtpService).send(user.getId().toString(), user.getEmail(),
                "LOGIN_EMAIL_VERIFY", user.getFullName());
        verify(jwtTokenProvider, never()).generatePreScopeToken(eq(user), any());
    }

    @Test
    void validEmailOtpMarksEmailTrustedAndContinuesLogin() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).username("staff.two")
                .email("staff2@example.com").passwordHash("hash").role(Role.STAFF)
                .emailVerificationRequired(true).build();
        when(jwtTokenProvider.validateToken("email-token")).thenReturn(true);
        when(jwtTokenProvider.extractScope("email-token")).thenReturn("EMAIL_VERIFY_PENDING");
        when(jwtTokenProvider.extractUserId("email-token")).thenReturn(userId.toString());
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(tenantService.buildTenantInfoList(userId)).thenReturn(List.of());
        when(jwtTokenProvider.generatePreScopeToken(eq(user), any())).thenReturn("tenant-token");

        var result = authService.verifyLoginEmailOtp("email-token", "123456");

        assertThat(user.getEmailVerifiedAt()).isNotNull();
        assertThat(user.isEmailVerificationRequired()).isFalse();
        assertThat(result.getLoginToken()).isEqualTo("tenant-token");
        verify(accountEmailOtpService).verify(userId.toString(), user.getEmail(),
                "LOGIN_EMAIL_VERIFY", "123456");
    }

    @Test
    void tenantSelectionRevalidatesStatusAndAddOnsBeforeIssuingScopedToken() {
        UUID userId = UUID.randomUUID();
        String tenantId = UUID.randomUUID().toString();
        User user = User.builder().id(userId).username("admin.one").role(Role.ADMIN).build();
        TenantInfo stale = TenantInfo.builder()
                .tenantId(tenantId).status("ACTIVE").plan("GROWTH")
                .analyticsEnabled(true).chatEnabled(true).settlementEnabled(true).build();
        TenantInfo fresh = TenantInfo.builder()
                .tenantId(tenantId).status("SUSPENDED").plan("BASIC")
                .analyticsEnabled(false).chatEnabled(false).settlementEnabled(false).build();
        SelectTenantRequest request = new SelectTenantRequest();
        request.setLoginToken("pre-scope-token");
        request.setTenantId(tenantId);

        when(jwtTokenProvider.validateToken("pre-scope-token")).thenReturn(true);
        when(jwtTokenProvider.extractScope("pre-scope-token")).thenReturn("TENANT_SELECT");
        when(jwtTokenProvider.extractUserId("pre-scope-token")).thenReturn(userId.toString());
        when(jwtTokenProvider.extractTenants("pre-scope-token")).thenReturn(List.of(stale));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(tenantService.buildTenantInfoList(userId)).thenReturn(List.of(fresh));
        when(jwtTokenProvider.generateScopedToken(user, tenantId, null, "BASIC",
                "SUSPENDED", null, null)).thenReturn("fresh-scoped-token");
        when(jwtTokenProvider.generateRefreshTokenValue()).thenReturn("fresh-refresh-token");

        var response = authService.selectTenant(request);

        assertThat(response.getAccessToken()).isEqualTo("fresh-scoped-token");
        assertThat(response.getTenant()).isSameAs(fresh);
        verify(jwtTokenProvider).generateScopedToken(user, tenantId, null, "BASIC",
                "SUSPENDED", null, null);
    }

    @Test
    void refreshRejectsSessionWhenTenantMembershipWasRemoved() {
        UUID userId = UUID.randomUUID();
        String tenantId = UUID.randomUUID().toString();
        User user = User.builder().id(userId).username("removed.member").role(Role.MEMBER).build();
        RefreshToken token = RefreshToken.builder().user(user).token("stored-hash")
                .tenantId(tenantId).expiresAt(LocalDateTime.now().plusDays(1)).revoked(false).build();
        when(refreshTokenRepository.findByToken(AuthService.sha256Value("removed-membership-token")))
                .thenReturn(Optional.of(token));
        when(tenantService.buildTenantInfoList(userId)).thenReturn(List.of());

        assertThatThrownBy(() -> authService.refreshByToken("removed-membership-token"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("You are no longer a member of this organization");

        assertThat(token.isRevoked()).isTrue();
        verify(refreshTokenRepository).save(token);
        verify(jwtTokenProvider, never()).generateRefreshTokenValue();
    }

    @Test
    void passwordRecoveryLookupDoesNotExposeAccountExistenceOrDatabaseId() {
        User known = User.builder().id(UUID.randomUUID()).username("member.one")
                .phone("9876543210").phoneCountryCode("+91").role(Role.MEMBER).build();
        when(userRepository.findByUsername("member.one")).thenReturn(Optional.of(known));
        when(userRepository.findByUsername("missing.user")).thenReturn(Optional.empty());
        when(userRepository.findByPhoneAndDeletedAtIsNull("missing.user")).thenReturn(List.of());
        when(jwtTokenProvider.generatePasswordRecoveryChallenge(eq(known.getId()), eq(true)))
                .thenReturn("known-opaque-challenge");
        when(jwtTokenProvider.generatePasswordRecoveryChallenge(any(UUID.class), eq(false)))
                .thenReturn("decoy-opaque-challenge");

        var knownResult = authService.lookupForPasswordReset("member.one");
        var missingResult = authService.lookupForPasswordReset("missing.user");

        assertThat(knownResult.getUserId()).isEqualTo("known-opaque-challenge");
        assertThat(knownResult.getUserId()).doesNotContain(known.getId().toString());
        assertThat(knownResult.getMaskedPhone()).isEqualTo(missingResult.getMaskedPhone());
        assertThat(knownResult.getRole()).isNull();
        assertThat(missingResult.getRole()).isNull();
        assertThat(knownResult.isLocked()).isFalse();
        assertThat(missingResult.isLocked()).isFalse();
    }

    @Test
    void ambiguousPhoneRecoveryDoesNotSelectOneOfSeveralAccounts() {
        User member = User.builder().id(UUID.randomUUID()).phone("9876543210").role(Role.MEMBER).build();
        User staff = User.builder().id(UUID.randomUUID()).phone("9876543210").role(Role.STAFF).build();
        when(userRepository.findByUsername("9876543210")).thenReturn(Optional.empty());
        when(userRepository.findByPhoneAndDeletedAtIsNull("9876543210")).thenReturn(List.of(member, staff));
        when(jwtTokenProvider.generatePasswordRecoveryChallenge(any(UUID.class), eq(false)))
                .thenReturn("decoy");

        var result = authService.lookupForPasswordReset("9876543210");

        assertThat(result.getUserId()).isEqualTo("decoy");
        verify(jwtTokenProvider, never()).generatePasswordRecoveryChallenge(eq(member.getId()), eq(true));
        verify(jwtTokenProvider, never()).generatePasswordRecoveryChallenge(eq(staff.getId()), eq(true));
    }

    @Test
    void decoyRecoveryChallengeNeverSendsAnOtp() {
        io.jsonwebtoken.Claims claims = mock(io.jsonwebtoken.Claims.class);
        when(jwtTokenProvider.validateToken("decoy")).thenReturn(true);
        when(jwtTokenProvider.extractClaims("decoy")).thenReturn(claims);
        when(claims.get("scope", String.class)).thenReturn("PASSWORD_RECOVERY_LOOKUP");
        when(claims.get("accountResolved", Boolean.class)).thenReturn(false);

        authService.sendForgotPasswordOtpNew("decoy", "3210");

        verify(otpService, never()).sendOtp(any(), any(), any(), any());
    }

    @Test
    void verifiedPhoneOtpReturnsRawTokenButStoresOnlyItsHash() {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).username("member.three")
                .phone("9876543210").phoneCountryCode("+91").role(Role.MEMBER).build();
        io.jsonwebtoken.Claims claims = mock(io.jsonwebtoken.Claims.class);
        when(jwtTokenProvider.validateToken("recovery-challenge")).thenReturn(true);
        when(jwtTokenProvider.extractClaims("recovery-challenge")).thenReturn(claims);
        when(claims.get("scope", String.class)).thenReturn("PASSWORD_RECOVERY_LOOKUP");
        when(claims.get("accountResolved", Boolean.class)).thenReturn(true);
        when(claims.getSubject()).thenReturn(userId.toString());
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        var result = authService.verifyForgotPasswordOtp("recovery-challenge", "123456");

        assertThat(result.getResetToken()).hasSize(64);
        assertThat(user.getPasswordResetToken())
                .isEqualTo(AuthService.sha256Value(result.getResetToken()))
                .isNotEqualTo(result.getResetToken());
        assertThat(user.getPasswordResetTokenExpiresAt()).isAfter(LocalDateTime.now());
        verify(otpService).verifyOtp(user.getPhone(), "FORGOT_PASSWORD",
                userId.toString(), "123456");
    }

    @Test
    void passwordResetLooksUpHashedTokenAndRevokesAllTrust() {
        UUID userId = UUID.randomUUID();
        String rawToken = "raw-reset-token";
        User user = User.builder().id(userId).username("staff.three")
                .passwordHash("old-hash").role(Role.STAFF)
                .passwordResetToken(AuthService.sha256Value(rawToken))
                .passwordResetTokenExpiresAt(LocalDateTime.now().plusMinutes(5))
                .build();
        when(userRepository.findByPasswordResetToken(AuthService.sha256Value(rawToken)))
                .thenReturn(Optional.of(user));
        when(passwordEncoder.encode("NewPassword@1")).thenReturn("new-hash");

        authService.resetPasswordWithToken(rawToken, "NewPassword@1");

        assertThat(user.getPasswordHash()).isEqualTo("new-hash");
        assertThat(user.getPasswordResetToken()).isNull();
        assertThat(user.getPasswordResetTokenExpiresAt()).isNull();
        verify(passwordValidator).validate("NewPassword@1");
        verify(refreshTokenRepository).revokeAllActiveByUser(user);
        verify(trustedDeviceRepository).deleteByUserId(userId);
    }

    @Test
    void loginReturnsDevOtpWhenExposureEnabled() throws Exception {
        // When app.dev.otp-exposure.enabled=true, the devOtp field in LoginResponse
        // must contain the OTP so developers can complete email-OTP flows without a real mailbox.
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).username("org.admin")
                .passwordHash("hash").role(Role.ADMIN).tenantId("tenant-1")
                .email("admin@test.com")
                .emailVerificationRequired(true)
                .build();
        LoginRequest request = new LoginRequest();
        request.setUsername("org.admin");
        request.setPassword("pass");
        when(userRepository.findByUsername("org.admin")).thenReturn(Optional.of(user));
        Authentication auth = new UsernamePasswordAuthenticationToken(user, "pass", user.getAuthorities());
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(userRepository.save(any())).thenReturn(user);
        when(accountEmailOtpService.send(any(), any(), any(), any())).thenReturn("654321");
        when(jwtTokenProvider.generateEmailVerificationToken(user)).thenReturn("ev-jwt");

        var field = AuthService.class.getDeclaredField("devOtpExposureEnabled");
        field.setAccessible(true);
        field.set(authService, true);

        var response = authService.login(request, null);

        assertThat(response.isRequiresEmailVerification()).isTrue();
        assertThat(response.getDevOtp()).isEqualTo("654321");

        field.set(authService, false); // restore
    }

    @Test
    void loginDoesNotExposeDevOtpByDefault() throws Exception {
        UUID userId = UUID.randomUUID();
        User user = User.builder().id(userId).username("org.admin2")
                .passwordHash("hash").role(Role.ADMIN).tenantId("tenant-1")
                .email("admin2@test.com")
                .emailVerificationRequired(true)
                .build();
        LoginRequest request = new LoginRequest();
        request.setUsername("org.admin2");
        request.setPassword("pass");
        when(userRepository.findByUsername("org.admin2")).thenReturn(Optional.of(user));
        Authentication auth = new UsernamePasswordAuthenticationToken(user, "pass", user.getAuthorities());
        when(authenticationManager.authenticate(any())).thenReturn(auth);
        when(userRepository.save(any())).thenReturn(user);
        when(accountEmailOtpService.send(any(), any(), any(), any())).thenReturn("999999");
        when(jwtTokenProvider.generateEmailVerificationToken(user)).thenReturn("ev-jwt");
        // devOtpExposureEnabled defaults to false — no reflection needed

        var response = authService.login(request, null);

        assertThat(response.isRequiresEmailVerification()).isTrue();
        assertThat(response.getDevOtp()).isNull();
    }

    @Test
    void devOtpExposureGuardThrowsOnProdProfile() {
        var guard = new com.chitfund.userservice.config.DevOtpExposureGuard(
                new org.springframework.mock.env.MockEnvironment()
                        .withProperty("spring.profiles.active", "prod"));
        try {
            var field = com.chitfund.userservice.config.DevOtpExposureGuard.class
                    .getDeclaredField("devOtpExposureEnabled");
            field.setAccessible(true);
            field.set(guard, true);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        // MockEnvironment doesn't auto-activate profiles from property; set directly
        org.springframework.mock.env.MockEnvironment env = new org.springframework.mock.env.MockEnvironment();
        env.setActiveProfiles("prod");
        var guard2 = new com.chitfund.userservice.config.DevOtpExposureGuard(env);
        try {
            var field = com.chitfund.userservice.config.DevOtpExposureGuard.class
                    .getDeclaredField("devOtpExposureEnabled");
            field.setAccessible(true);
            field.set(guard2, true);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                () -> guard2.validate());
    }

    @Test
    void devOtpExposureGuardDoesNotThrowOnNonProdWithExposureDisabled() {
        org.springframework.mock.env.MockEnvironment env = new org.springframework.mock.env.MockEnvironment();
        env.setActiveProfiles("prod");
        var guard = new com.chitfund.userservice.config.DevOtpExposureGuard(env);
        // devOtpExposureEnabled defaults to false — should not throw even on prod
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> guard.validate());
    }

    // ─── OTP logging guard ────────────────────────────────────────────────────

    private com.chitfund.userservice.config.OtpLoggingGuard loggingGuardWith(
            boolean enabled, String... profiles) {
        org.springframework.mock.env.MockEnvironment env =
                new org.springframework.mock.env.MockEnvironment();
        if (profiles.length > 0) env.setActiveProfiles(profiles);
        var guard = new com.chitfund.userservice.config.OtpLoggingGuard(env);
        try {
            var field = com.chitfund.userservice.config.OtpLoggingGuard.class
                    .getDeclaredField("otpLoggingEnabled");
            field.setAccessible(true);
            field.set(guard, enabled);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return guard;
    }

    @Test
    void otpLoggingGuardThrowsOnProdProfileWhenEnabled() {
        var guard = loggingGuardWith(true, "prod");
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                () -> guard.validate());
    }

    @Test
    void otpLoggingGuardThrowsOnProductionProfileWhenEnabled() {
        var guard = loggingGuardWith(true, "production");
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                () -> guard.validate());
    }

    @Test
    void otpLoggingGuardDoesNotThrowOnProdWhenDisabled() {
        var guard = loggingGuardWith(false, "prod");
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> guard.validate());
    }

    @Test
    void otpLoggingGuardDoesNotThrowOnLocalWhenEnabled() {
        var guard = loggingGuardWith(true, "local");
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> guard.validate());
    }

    @Test
    void otpLoggingGuardDoesNotThrowOnTestWhenEnabled() {
        var guard = loggingGuardWith(true, "test");
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> guard.validate());
    }

    @Test
    void otpLoggingGuardDoesNotThrowWithNoProfileWhenEnabled() {
        var guard = loggingGuardWith(true /* no profiles */);
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> guard.validate());
    }
}
