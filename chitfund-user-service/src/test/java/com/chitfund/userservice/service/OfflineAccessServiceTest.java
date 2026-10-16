package com.chitfund.userservice.service;

import com.chitfund.common.offline.OfflineAccessTokens;
import com.chitfund.common.offline.OfflineReconciliationRequest;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.response.TenantInfo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OfflineAccessServiceTest {
    private final Instant now = Instant.parse("2026-10-15T12:00:00Z");
    private TenantService tenants;
    private OfflineAccessService service;
    private User user;
    private TenantInfo tenant;

    @BeforeEach
    void setUp() {
        tenants = mock(TenantService.class);
        service = new OfflineAccessService(tenants, new OfflineAccessTokens(
                "test-offline-secret-at-least-thirty-two-characters", Clock.fixed(now, ZoneOffset.UTC)));
        user = User.builder().id(UUID.randomUUID()).role(Role.ADMIN)
                .enabled(true).hasAppAccess(true).build();
        tenant = TenantInfo.builder().tenantId("org-a").role("ADMIN").status("ACTIVE").offlineEnabled(true).build();
        when(tenants.buildTenantInfoList(user.getId())).thenReturn(List.of(tenant));
    }

    @Test
    void enabledOrganisationGetsOnlyItsOwnGrant() {
        var response = service.issue(user, "org-a");
        assertThat(response.enabled()).isTrue();
        assertThat(response.grant().actorId()).isEqualTo(user.getId().toString());
        assertThat(response.grant().tenantId()).isEqualTo("org-a");
        assertThat(service.issue(user, "org-b").enabled()).isFalse();
    }

    @Test
    void missingAddOnAndInactiveOrganisationNeverGetAGrant() {
        tenant.setOfflineEnabled(false);
        assertThat(service.issue(user, "org-a").reason()).isEqualTo("ADD_ON_REQUIRED");
        tenant.setOfflineEnabled(true);
        tenant.setStatus("SUSPENDED");
        assertThat(service.issue(user, "org-a").reason()).isEqualTo("ORGANISATION_INACTIVE");
    }

    @Test
    void expiredSubscriptionAndLockedAccountNeverGetAGrant() {
        tenant.setPlanExpiresAt(LocalDateTime.ofInstant(now.minusSeconds(1), ZoneOffset.UTC));
        assertThat(service.issue(user, "org-a").enabled()).isFalse();
        tenant.setPlanExpiresAt(null);
        user.setLocked(true);
        assertThat(service.issue(user, "org-a").reason()).isEqualTo("ACCOUNT_ACCESS_REQUIRED");
    }

    @Test
    void savedPaymentCanSyncAfterExpiryAndAddOnRemovalWithoutRenewal() {
        tenant.setPlanExpiresAt(LocalDateTime.ofInstant(now.plusSeconds(60), ZoneOffset.UTC));
        var grant = service.issue(user, "org-a").grant();
        tenant.setOfflineEnabled(false);
        var reconnect = new OfflineAccessService(tenants, new OfflineAccessTokens(
                "test-offline-secret-at-least-thirty-two-characters",
                Clock.fixed(now.plus(Duration.ofDays(365)), ZoneOffset.UTC)));
        var request = new OfflineReconciliationRequest(user.getId().toString(), "org-a", "ADMIN",
                "RECORD_PAYMENT", grant.token(), now.plusSeconds(59));
        assertThat(reconnect.authorizeRecordedAction(user, request).id()).isEqualTo(grant.id());
        assertThat(reconnect.issue(user, "org-a").enabled()).isFalse();
    }

    @Test
    void expiryRecoveryDoesNotBypassSuspensionRevokedRoleOrLockedAccount() {
        var grant = service.issue(user, "org-a").grant();
        var request = new OfflineReconciliationRequest(user.getId().toString(), "org-a", "ADMIN",
                "RECORD_PAYMENT", grant.token(), now);
        tenant.setStatus("SUSPENDED");
        assertThatThrownBy(() -> service.authorizeRecordedAction(user, request)).isInstanceOf(BusinessException.class);
        tenant.setStatus("ACTIVE");
        tenant.setRole("MANAGER");
        assertThatThrownBy(() -> service.authorizeRecordedAction(user, request)).isInstanceOf(BusinessException.class);
        tenant.setRole("ADMIN");
        user.setLocked(true);
        assertThatThrownBy(() -> service.authorizeRecordedAction(user, request)).isInstanceOf(BusinessException.class);
    }

    @Test
    void anotherOrganisationCannotReceiveASavedPayment() {
        var grant = service.issue(user, "org-a").grant();
        var request = new OfflineReconciliationRequest(user.getId().toString(), "org-b", "ADMIN",
                "RECORD_PAYMENT", grant.token(), now);
        assertThatThrownBy(() -> service.authorizeRecordedAction(user, request)).isInstanceOf(BusinessException.class);
    }
}
