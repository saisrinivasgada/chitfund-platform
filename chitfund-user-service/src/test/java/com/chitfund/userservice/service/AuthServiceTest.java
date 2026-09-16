package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.LoginRequest;
import com.chitfund.userservice.mapper.UserMapper;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.TrustedDeviceRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
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
    @InjectMocks AuthService authService;

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
}
