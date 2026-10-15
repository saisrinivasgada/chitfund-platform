package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.client.AuditClient;
import com.chitfund.userservice.domain.entity.Tenant;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.TenantRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProxyServiceSecurityTest {
    @Mock TenantRepository tenantRepository;
    @Mock UserRepository userRepository;
    @Mock MemberUserLinkRepository memberUserLinkRepository;
    @Mock JwtTokenProvider jwtTokenProvider;
    @Mock AuditClient auditClient;

    @Test
    void explicitUserFromAnotherTenantCannotReceiveScopedToken() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ProxyService service = service();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant(tenantId)));
        when(userRepository.findById(userId)).thenReturn(Optional.of(
                user(userId, UUID.randomUUID().toString(), Role.ADMIN)));

        assertThatThrownBy(() -> service.generateProxyToken(
                tenantId, "ADMIN", userId, "owner-1", "Investigating support issue"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("does not belong");

        verifyNoInteractions(jwtTokenProvider, auditClient);
    }

    @Test
    void callerCannotPromoteAStaffAccountByChoosingAdminRole() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        ProxyService service = service();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant(tenantId)));
        when(userRepository.findById(userId)).thenReturn(Optional.of(
                user(userId, tenantId.toString(), Role.STAFF)));

        assertThatThrownBy(() -> service.generateProxyToken(
                tenantId, "ADMIN", userId, "owner-1", "Investigating support issue"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("requested role");

        verifyNoInteractions(jwtTokenProvider, auditClient);
    }

    @Test
    void platformRolesCanNeverBeProxied() {
        UUID tenantId = UUID.randomUUID();
        ProxyService service = service();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant(tenantId)));

        assertThatThrownBy(() -> service.generateProxyToken(
                tenantId, "SUPER_ADMIN", null, "owner-1", "Investigating support issue"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("cannot be proxied");

        verifyNoInteractions(userRepository, jwtTokenProvider, auditClient);
    }

    @Test
    void validProxyIsAuditedWithoutPuttingTheTokenInAuditState() {
        UUID tenantId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        User admin = user(userId, tenantId.toString(), Role.ADMIN);
        ProxyService service = service();
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant(tenantId)));
        when(userRepository.findByTenantIdAndRoleInAndDeletedAtIsNull(
                tenantId.toString(), List.of(Role.ADMIN))).thenReturn(List.of(admin));
        when(jwtTokenProvider.generateScopedToken(
                eq(admin), eq(tenantId.toString()), eq("acme"), eq("GROWTH"),
                eq("ACTIVE"), eq("ADMIN"), isNull())).thenReturn("secret-token");

        var response = service.generateProxyToken(
                tenantId, "ADMIN", null, "owner-1", "Investigating payment issue");

        assertThat(response.getToken()).isEqualTo("secret-token");
        verify(auditClient).log(eq("PROXY_SESSION"), eq(userId.toString()),
                eq("PROXY_TOKEN_ISSUED"), eq("owner-1"), eq("SUPER_ADMIN"),
                isNull(), argThat(value -> !value.toString().contains("secret-token")),
                eq(tenantId.toString()), eq("HUB"), eq("SUCCESS"),
                eq("Investigating payment issue"));
    }

    @Test
    void reasonIsRequiredBeforeAnyTenantOrUserLookup() {
        ProxyService service = service();

        assertThatThrownBy(() -> service.generateProxyToken(
                UUID.randomUUID(), "ADMIN", null, "owner-1", " "))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("reason");

        verifyNoInteractions(tenantRepository, userRepository, jwtTokenProvider, auditClient);
    }

    private ProxyService service() {
        return new ProxyService(tenantRepository, userRepository, memberUserLinkRepository,
                jwtTokenProvider, auditClient);
    }

    private Tenant tenant(UUID id) {
        return Tenant.builder().id(id).name("Acme").slug("acme")
                .plan("GROWTH").status("ACTIVE").build();
    }

    private User user(UUID id, String tenantId, Role role) {
        return User.builder().id(id).username("user-" + id).passwordHash("hash")
                .tenantId(tenantId).role(role).enabled(true).locked(false).build();
    }
}
