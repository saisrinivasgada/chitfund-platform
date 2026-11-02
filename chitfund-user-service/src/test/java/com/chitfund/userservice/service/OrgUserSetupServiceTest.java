package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import com.chitfund.userservice.dto.request.OrgUserSetupCompleteRequest;
import com.chitfund.userservice.dto.request.OrgUserSetupEmailOtpRequest;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.TrustedDeviceRepository;
import com.chitfund.userservice.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for OrgUserSetupService — coverage for org-user invite setup flow,
 * purpose enforcement, concurrency cleanup on complete(), and mask-email helper.
 */
@ExtendWith(MockitoExtension.class)
class OrgUserSetupServiceTest {

    @Mock AccountSetupTokenRepository setupTokenRepository;
    @Mock UserRepository userRepository;
    @Mock TenantRepository tenantRepository;
    @Mock AccountEmailOtpService accountEmailOtpService;
    @Mock PasswordValidator passwordValidator;
    @Mock AuditClient auditClient;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock TrustedDeviceRepository trustedDeviceRepository;

    OrgUserSetupService service;

    @BeforeEach
    void setup() {
        service = new OrgUserSetupService(
                setupTokenRepository, userRepository, tenantRepository,
                accountEmailOtpService, new BCryptPasswordEncoder(),
                passwordValidator, auditClient, refreshTokenRepository, trustedDeviceRepository);
    }

    // ── maskEmail ─────────────────────────────────────────────────────────────

    @Test
    void maskEmailShowsFirstCharAndDomain() {
        assertThat(OrgUserSetupService.maskEmail("rahul@example.com")).isEqualTo("r***@example.com");
    }

    @Test
    void maskEmailHandlesSingleCharLocal() {
        assertThat(OrgUserSetupService.maskEmail("a@x.com")).isEqualTo("a***@x.com");
    }

    @Test
    void maskEmailHandlesNullAndNoAt() {
        assertThat(OrgUserSetupService.maskEmail(null)).isEqualTo("***@***");
        assertThat(OrgUserSetupService.maskEmail("notanemail")).isEqualTo("***@***");
    }

    // ── Purpose enforcement ───────────────────────────────────────────────────

    @Test
    void getPublicDetailsRejectsChitfundRequestToken() {
        String raw = "sometoken";
        String hash = OrgUserSetupService.sha256(raw);
        AccountSetupToken token = AccountSetupToken.builder()
                .purpose(SetupTokenPurpose.CHITFUND_REQUEST)
                .tokenHash(hash)
                .userId(UUID.randomUUID())
                .expiresAt(LocalDateTime.now().plusHours(24))
                .build();
        when(setupTokenRepository.findByTokenHash(hash)).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> service.getPublicDetails(raw))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("not valid");
    }

    @Test
    void sendEmailOtpRejectsExpiredToken() {
        String raw = "expiredtoken";
        String hash = OrgUserSetupService.sha256(raw);
        AccountSetupToken token = AccountSetupToken.builder()
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(hash)
                .userId(UUID.randomUUID())
                .expiresAt(LocalDateTime.now().minusHours(1))
                .build();
        when(setupTokenRepository.findByTokenHash(hash)).thenReturn(Optional.of(token));

        OrgUserSetupEmailOtpRequest req = new OrgUserSetupEmailOtpRequest();
        req.setToken(raw);

        assertThatThrownBy(() -> service.sendEmailOtp(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("expired");
    }

    @Test
    void sendEmailOtpRejectsAlreadyUsedToken() {
        String raw = "usedtoken";
        String hash = OrgUserSetupService.sha256(raw);
        AccountSetupToken token = AccountSetupToken.builder()
                .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                .tokenHash(hash)
                .userId(UUID.randomUUID())
                .usedAt(LocalDateTime.now().minusHours(1))
                .expiresAt(LocalDateTime.now().plusHours(24))
                .build();
        when(setupTokenRepository.findByTokenHash(hash)).thenReturn(Optional.of(token));

        OrgUserSetupEmailOtpRequest req = new OrgUserSetupEmailOtpRequest();
        req.setToken(raw);

        assertThatThrownBy(() -> service.sendEmailOtp(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("already been used");
    }

    // ── complete() revokes other active ORG_USER_INVITE tokens ───────────────

    @Nested
    class CompleteRevokesOtherActiveTokens {

        @Test
        void completeSetsUsedAtOnOtherActiveInviteTokens() {
            UUID userId = UUID.randomUUID();
            String raw = "completetoken";
            String hash = OrgUserSetupService.sha256(raw);

            AccountSetupToken mainToken = AccountSetupToken.builder()
                    .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                    .tokenHash(hash)
                    .userId(userId)
                    .expiresAt(LocalDateTime.now().plusHours(24))
                    .build();

            AccountSetupToken staleToken = AccountSetupToken.builder()
                    .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                    .tokenHash("stalehash")
                    .userId(userId)
                    .expiresAt(LocalDateTime.now().plusHours(48))
                    .build();

            User user = User.builder()
                    .id(userId)
                    .email("rahul@example.com")
                    .role(Role.ADMIN)
                    .tenantId(UUID.randomUUID().toString())
                    .build();

            when(setupTokenRepository.findByTokenHashForUpdate(hash)).thenReturn(Optional.of(mainToken));
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));
            doNothing().when(accountEmailOtpService).verify(any(), any(), any(), any());
            doNothing().when(passwordValidator).validate(any());
            when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(setupTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(setupTokenRepository.findAllByUserIdAndPurposeAndUsedAtIsNull(
                    eq(userId), eq(SetupTokenPurpose.ORG_USER_INVITE)))
                    .thenReturn(List.of(staleToken));

            OrgUserSetupCompleteRequest req = new OrgUserSetupCompleteRequest();
            req.setToken(raw);
            req.setEmailOtp("123456");
            req.setNewPassword("ValidPassword!8");
            req.setTermsAccepted(true);

            service.complete(req);

            // The stale token must have been revoked
            assertThat(staleToken.getUsedAt()).isNotNull();
            verify(setupTokenRepository, atLeastOnce()).save(staleToken);
        }

        @Test
        void completeWithNoOtherActiveTokensDoesNotThrow() {
            UUID userId = UUID.randomUUID();
            String raw = "onlytokentoken";
            String hash = OrgUserSetupService.sha256(raw);

            AccountSetupToken mainToken = AccountSetupToken.builder()
                    .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                    .tokenHash(hash)
                    .userId(userId)
                    .expiresAt(LocalDateTime.now().plusHours(24))
                    .build();

            User user = User.builder()
                    .id(userId)
                    .email("test@example.com")
                    .role(Role.MANAGER)
                    .tenantId(UUID.randomUUID().toString())
                    .build();

            when(setupTokenRepository.findByTokenHashForUpdate(hash)).thenReturn(Optional.of(mainToken));
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));
            doNothing().when(accountEmailOtpService).verify(any(), any(), any(), any());
            doNothing().when(passwordValidator).validate(any());
            when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(setupTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            when(setupTokenRepository.findAllByUserIdAndPurposeAndUsedAtIsNull(
                    any(), eq(SetupTokenPurpose.ORG_USER_INVITE)))
                    .thenReturn(List.of());

            OrgUserSetupCompleteRequest req = new OrgUserSetupCompleteRequest();
            req.setToken(raw);
            req.setEmailOtp("654321");
            req.setNewPassword("ValidPassword!9");
            req.setTermsAccepted(true);

            service.complete(req); // must not throw
        }

        @Test
        void completeRejectsWhenTermsNotAccepted() {
            UUID userId = UUID.randomUUID();
            String raw = "notermstoken";
            String hash = OrgUserSetupService.sha256(raw);

            AccountSetupToken mainToken = AccountSetupToken.builder()
                    .purpose(SetupTokenPurpose.ORG_USER_INVITE)
                    .tokenHash(hash)
                    .userId(userId)
                    .expiresAt(LocalDateTime.now().plusHours(24))
                    .build();

            User user = User.builder()
                    .id(userId)
                    .email("test@example.com")
                    .role(Role.ADMIN)
                    .tenantId(UUID.randomUUID().toString())
                    .build();

            when(setupTokenRepository.findByTokenHashForUpdate(hash)).thenReturn(Optional.of(mainToken));
            when(userRepository.findById(userId)).thenReturn(Optional.of(user));
            doNothing().when(accountEmailOtpService).verify(any(), any(), any(), any());

            OrgUserSetupCompleteRequest req = new OrgUserSetupCompleteRequest();
            req.setToken(raw);
            req.setEmailOtp("111111");
            req.setNewPassword("ValidPassword!0");
            req.setTermsAccepted(false);

            assertThatThrownBy(() -> service.complete(req))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("terms");
        }
    }
}
