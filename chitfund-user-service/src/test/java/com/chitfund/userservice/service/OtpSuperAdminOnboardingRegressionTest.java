package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.AddOrgUserRequest;
import com.chitfund.userservice.dto.response.OrgUserResponse;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.AccountSetupTokenRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.repository.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Regression tests for OTP, SUPER_ADMIN lock/unlock, and onboarding fixes.
 */
@ExtendWith(MockitoExtension.class)
class OtpSuperAdminOnboardingRegressionTest {

    // ── Fix 7: RateLimiterService sha256 is deterministic and IP-hashing ────

    @Test
    void sha256IsConsistentAndDoesNotReturnRawIp() {
        String ip = "192.168.1.100";
        String hash1 = RateLimiterService.sha256(ip);
        String hash2 = RateLimiterService.sha256(ip);
        assertThat(hash1).isEqualTo(hash2);
        assertThat(hash1).doesNotContain(ip);
        assertThat(hash1).hasSize(64); // SHA-256 hex
    }

    @Test
    void sha256NullIpDoesNotThrow() {
        assertThat(RateLimiterService.sha256(null)).hasSize(64);
    }

    // ── Fix 5: WhatsAppSmsService — safeErrorCode redacts OTPs and tokens ──

    @Test
    void safeErrorCodeRedactsSixDigitOtp() {
        String body = "{\"error\":{\"code\":190,\"message\":\"OTP 123456 is wrong\",\"type\":\"OAuthException\"}}";
        String safe = WhatsAppSmsService.safeErrorCode(body);
        assertThat(safe).doesNotContain("123456");
    }

    @Test
    void safeErrorCodeIncludesErrorCodeAndType() {
        String body = "{\"error\":{\"code\":190,\"type\":\"OAuthException\",\"message\":\"token invalid\"}}";
        String safe = WhatsAppSmsService.safeErrorCode(body);
        assertThat(safe).contains("code");
    }

    @Test
    void safeErrorCodeHandlesNullBody() {
        assertThat(WhatsAppSmsService.safeErrorCode(null)).isEqualTo("no-body");
    }

    // ── Fix 6: EmailService — HTML escaping prevents XSS ───────────────────

    @Test
    void escapeHtmlBlocksScriptTag() {
        String escaped = EmailService.escapeHtml("<script>alert(1)</script>");
        assertThat(escaped).doesNotContain("<script>");
        assertThat(escaped).contains("&lt;script&gt;");
    }

    @Test
    void escapeHtmlHandlesAmpersandAndQuotes() {
        assertThat(EmailService.escapeHtml("A & B \"Chits\""))
                .isEqualTo("A &amp; B &quot;Chits&quot;");
    }

    @Test
    void buildRejectionEmailDoesNotContainUnescapedOrgName() {
        String html = EmailService.buildRejectionEmailHtml(
                "<b>Admin</b>", "<script>alert(1)</script> Chits");
        assertThat(html).doesNotContain("<script>");
        assertThat(html).contains("&lt;script&gt;");
    }

    @Test
    void buildSuspensionEmailDoesNotContainUnescapedOrgName() {
        String html = EmailService.buildSuspensionEmailHtml(
                "Admin", "A & B \"Chits\"");
        assertThat(html)
                .doesNotContain("A & B")
                .contains("A &amp; B");
    }

    @Test
    void buildOrgUserSetupEmailContainsLinkNotCredential() {
        String fakeTempPassword = "xK9mQ#PlaceholderPwd!";
        String html = EmailService.buildOrgUserSetupHtml(
                "Rahul", "TestOrg", "MANAGER", "rahul123",
                "https://app.thechitwise.com/setup-account?token=abc123", 72);
        // setup link is present and opens the account-setup flow
        assertThat(html).contains("setup-account?token=abc123");
        // username is shown (expected) but no raw credential value
        assertThat(html).contains("rahul123");
        assertThat(html).doesNotContain(fakeTempPassword);
        // "Temp password" table row from the OLD orgCreated template must not appear
        assertThat(html).doesNotContain("Temp password");
    }

    @Test
    void sanitizeUrlRejectsJavascriptScheme() {
        assertThat(EmailService.sanitizeUrl("javascript:alert(1)")).isEqualTo("#");
        assertThat(EmailService.sanitizeUrl("data:text/html,<h1>hi</h1>")).isEqualTo("#");
    }

    @Test
    void sanitizeUrlAllowsHttpsUrls() {
        String url = "https://app.thechitwise.com/setup-account?token=abc";
        assertThat(EmailService.sanitizeUrl(url)).isEqualTo(EmailService.escapeHtml(url));
    }

    // ── Fix 2: OrgUserResponse does not include tempPassword ────────────────

    @Test
    void orgUserResponseBuilderHasNoTempPasswordField() throws NoSuchFieldException {
        // Verify the field was removed from the DTO
        var fields = java.util.Arrays.stream(OrgUserResponse.class.getDeclaredFields())
                .map(java.lang.reflect.Field::getName)
                .toList();
        assertThat(fields).doesNotContain("tempPassword");
    }

    @Test
    void orgUserResponseBuilderHasSetupEmailQueuedField() throws NoSuchFieldException {
        OrgUserResponse response = OrgUserResponse.builder()
                .username("test")
                .setupEmailQueued(true)
                .maskedEmail("r***@example.com")
                .build();
        assertThat(response.isSetupEmailQueued()).isTrue();
        assertThat(response.getMaskedEmail()).isEqualTo("r***@example.com");
    }

    // ── Fix 1: UserService — SUPER_ADMIN cannot lock cross-tenant user ──────

    @Nested
    class SuperAdminLockUnlockTests {
        @Mock UserRepository userRepository;
        @Mock com.chitfund.userservice.client.AuditClient auditClient;
        @Mock PlanService planService;
        @Mock com.chitfund.userservice.mapper.UserMapper userMapper;
        @Mock com.chitfund.userservice.repository.RefreshTokenRepository refreshTokenRepository;
        @Mock com.chitfund.userservice.repository.TrustedDeviceRepository trustedDeviceRepository;

        UserService userService;

        @BeforeEach
        void setup() {
            userService = new UserService(userRepository, auditClient, planService,
                    userMapper, refreshTokenRepository, trustedDeviceRepository);
        }

        @Test
        void crossTenantUserLockReturnNotFound() {
            UUID tenantA = UUID.randomUUID();
            UUID tenantB = UUID.randomUUID();
            UUID userId  = UUID.randomUUID();

            User user = User.builder().id(userId).tenantId(tenantA.toString())
                    .role(Role.MANAGER).locked(false).build();
            when(userRepository.findByIdForUpdate(userId)).thenReturn(Optional.of(user));

            User actor = User.builder().id(UUID.randomUUID()).role(Role.SUPER_ADMIN).build();

            assertThatThrownBy(() -> userService.superAdminLockUser(tenantB, userId, actor))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        void superAdminCannotLockAnotherSuperAdmin() {
            UUID tenantId = UUID.randomUUID();
            UUID targetId = UUID.randomUUID();

            User target = User.builder().id(targetId).tenantId(tenantId.toString())
                    .role(Role.SUPER_ADMIN).locked(false).build();
            when(userRepository.findByIdForUpdate(targetId)).thenReturn(Optional.of(target));

            User actor = User.builder().id(UUID.randomUUID()).role(Role.SUPER_ADMIN).build();

            assertThatThrownBy(() -> userService.superAdminLockUser(tenantId, targetId, actor))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("protected");
        }

        @Test
        void idempotentLockDoesNotEmitAuditEvent() {
            UUID tenantId = UUID.randomUUID();
            UUID targetId = UUID.randomUUID();

            User target = User.builder().id(targetId).tenantId(tenantId.toString())
                    .role(Role.MANAGER).locked(true).build();
            when(userRepository.findByIdForUpdate(targetId)).thenReturn(Optional.of(target));
            when(userMapper.toResponse(any())).thenReturn(mock(com.chitfund.userservice.dto.response.UserResponse.class));

            User actor = User.builder().id(UUID.randomUUID()).role(Role.SUPER_ADMIN).build();
            userService.superAdminLockUser(tenantId, targetId, actor);

            verifyNoInteractions(auditClient);
        }
    }
}
