package com.chitfund.auditservice.service;

import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.repository.AuditLogRepository;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class AuditServiceTenantTest {

    @Test
    void recordRejectsMissingTenantInsteadOfUsingAPlatformDefault() {
        AuditLogRepository repository = mock(AuditLogRepository.class);
        AuditService service = new AuditService(repository);
        AuditLogRequest request = new AuditLogRequest(
                "user-service", "USER", "user-1", null,
                "UPDATED", "actor-1", "ADMIN", null,
                null, null, null, null);

        assertThatThrownBy(() -> service.record(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("tenantId is required");
        verifyNoInteractions(repository);
    }
}
