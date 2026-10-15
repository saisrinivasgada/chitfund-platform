package com.chitfund.userservice.service;

import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.RefreshTokenRepository;
import com.chitfund.userservice.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthenticationSecurityServiceTest {
    @Mock UserRepository userRepository;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock AuditClient auditClient;

    @Test
    void fifthFailureLocksAccountAndCreatesDeniedSecurityAudit() {
        User user = User.builder().id(UUID.randomUUID()).username("admin.one")
                .tenantId("tenant-1").role(Role.ADMIN).failedLoginAttempts(4).build();
        when(userRepository.findByIdForUpdate(user.getId())).thenReturn(Optional.of(user));
        AuthenticationSecurityService service = new AuthenticationSecurityService(
                userRepository, refreshTokenRepository, auditClient);

        boolean locked = service.recordFailedLoginAttempt(user.getId());

        assertThat(locked).isTrue();
        assertThat(user.getFailedLoginAttempts()).isEqualTo(5);
        assertThat(user.isLocked()).isTrue();
        verify(auditClient).log(eq("USER_ACCOUNT"), eq(user.getId().toString()),
                eq("LOGIN_FAILED"), eq(null), eq("ANONYMOUS"),
                eq(Map.of("failedAttempts", 4, "locked", false)),
                eq(Map.of("failedAttempts", 5, "locked", true)),
                eq("tenant-1"), eq("API"), eq("DENIED"), eq("Invalid credentials"));
    }

    @Test
    void refreshReplayRevokesEverySessionAndCreatesDeniedAudit() {
        User user = User.builder().id(UUID.randomUUID()).username("member.one")
                .role(Role.MEMBER).build();
        when(userRepository.findByIdForUpdate(user.getId())).thenReturn(Optional.of(user));
        AuthenticationSecurityService service = new AuthenticationSecurityService(
                userRepository, refreshTokenRepository, auditClient);

        service.recordRefreshTokenReplay(user.getId());

        verify(refreshTokenRepository).revokeAllActiveByUser(user);
        verify(auditClient).log(eq("USER_ACCOUNT"), eq(user.getId().toString()),
                eq("REFRESH_TOKEN_REPLAYED"), eq(null), eq("ANONYMOUS"),
                eq(null), eq(Map.of("allSessionsRevoked", true)), eq("IDENTITY"),
                eq("API"), eq("DENIED"), eq("Revoked refresh token was reused"));
    }

    @Test
    void unknownLoginStoresOnlyAOneWayIdentifierFingerprint() {
        AuthenticationSecurityService service = new AuthenticationSecurityService(
                userRepository, refreshTokenRepository, auditClient);

        service.recordUnknownLoginAttempt("Person@Example.com");

        verify(auditClient).log(eq("LOGIN_IDENTIFIER"),
                argThat(value -> value.length() == 64
                        && !value.contains("Person") && !value.contains("Example")),
                eq("LOGIN_FAILED"), eq(null), eq("ANONYMOUS"), eq(null),
                eq(Map.of("accountResolved", false)), eq("IDENTITY"),
                eq("API"), eq("DENIED"), eq("Invalid credentials"));
    }
}
