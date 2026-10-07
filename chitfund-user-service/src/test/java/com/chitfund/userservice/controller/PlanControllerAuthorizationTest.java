package com.chitfund.userservice.controller;

import com.chitfund.userservice.domain.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.prepost.PreAuthorize;

import static org.assertj.core.api.Assertions.assertThat;

class PlanControllerAuthorizationTest {

    @Test
    void organizationPlanRequestsAreAdminOnly() throws Exception {
        assertAdminOnly("requestUpgrade", String.class, User.class);
        assertAdminOnly("requestRenewal", User.class);
    }

    private static void assertAdminOnly(String method, Class<?>... parameters) throws Exception {
        PreAuthorize guard = PlanController.class.getMethod(method, parameters)
                .getAnnotation(PreAuthorize.class);
        assertThat(guard).isNotNull();
        assertThat(guard.value()).isEqualTo("hasAuthority('ROLE_ADMIN')");
    }
}
