package com.chitfund.common.plan;

import com.chitfund.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PlanEntitlementVerifierTest {

    @Test
    void missingOrMalformedEntitlementsNeverGrantAccess() {
        assertThatThrownBy(() -> PlanEntitlementVerifier.requireActiveSubscription(Map.of()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid");
        assertThatThrownBy(() -> PlanEntitlementVerifier.requireLimit(
                Map.of("maxMembers", "unlimited"), "maxMembers"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid");
        assertThatThrownBy(() -> PlanEntitlementVerifier.requireLimit(
                Map.of("maxMembers", 1.5), "maxMembers"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid");
        assertThatThrownBy(() -> PlanEntitlementVerifier.requireCsvValues(
                Map.of("allowedChitTypes", "RESERVATION,UNKNOWN"),
                "allowedChitTypes", Set.of("RESERVATION", "AUCTION", "LOTTERY")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid");
    }

    @Test
    void suspendedTenantIsDeniedEvenWhenLimitsAndExpiryWouldAllowUse() {
        assertThatThrownBy(() -> PlanEntitlementVerifier.requireActiveSubscription(Map.of(
                "tenantStatus", "SUSPENDED", "maxMembers", 100)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("suspended");
    }

    @Test
    void activeTenantAcceptsExplicitLimitsAndKnownChitTypes() {
        Map<String, Object> limits = Map.of(
                "tenantStatus", "ACTIVE",
                "maxMembers", -1,
                "allowedChitTypes", "reservation, auction");

        PlanEntitlementVerifier.requireActiveSubscription(limits);
        assertThat(PlanEntitlementVerifier.requireLimit(limits, "maxMembers")).isEqualTo(-1);
        assertThat(PlanEntitlementVerifier.requireCsvValues(limits, "allowedChitTypes",
                Set.of("RESERVATION", "AUCTION", "LOTTERY")))
                .containsExactlyInAnyOrder("RESERVATION", "AUCTION");
    }
}
