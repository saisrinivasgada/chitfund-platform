package com.chitfund.auditservice.controller;

import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.context.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class AuditQueryControllerTest {

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void organizationAuditQueryFailsClosedWithoutTenantContext() {
        AuditService auditService = mock(AuditService.class);
        AuditQueryController controller = new AuditQueryController(auditService);

        assertThatThrownBy(() -> controller.search(
                null, null, null, null, null, null, null, null,
                null, null, PageRequest.of(0, 50)))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("Organization context");

        verifyNoInteractions(auditService);
    }
}
