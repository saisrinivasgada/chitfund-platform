package com.chitfund.auditservice.service;

import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.domain.AuditLog;
import com.chitfund.auditservice.repository.AuditLogRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;

class AuditServiceTenantTest {

    @Test
    void recordNormalizesSupportedTimelineDimensions() {
        AuditLogRepository repository = mock(AuditLogRepository.class);
        AuditService service = new AuditService(repository);
        String eventId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        AuditLogRequest request = new AuditLogRequest(
                "payment-service", "PAYMENT", "payment-1", "chit-1",
                "RECORDED", "actor-1", "ADMIN", null,
                null, null, null, "tenant-1", eventId,
                "request-1", "key-1", " offline_sync ", " success ", null,
                null, null, null, java.time.Instant.parse("2026-09-27T10:00:00Z"),
                java.time.Instant.parse("2026-09-27T09:59:00Z"),
                java.time.Instant.parse("2026-09-27T10:00:01Z"));

        service.record(request);

        ArgumentCaptor<AuditLog> saved = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getId()).isEqualTo(eventId);
        assertThat(saved.getValue().getSource()).isEqualTo("OFFLINE_SYNC");
        assertThat(saved.getValue().getOutcome()).isEqualTo("SUCCESS");
        assertThat(saved.getValue().getOccurredAt()).isEqualTo("2026-09-27T10:00:00Z");
        assertThat(saved.getValue().getCreatedAt()).isNotNull();
    }

    @Test
    void recordRejectsUnknownSourceAndOutcome() {
        AuditLogRepository repository = mock(AuditLogRepository.class);
        AuditService service = new AuditService(repository);
        AuditLogRequest request = new AuditLogRequest(
                "payment-service", "PAYMENT", "payment-1", null,
                "RECORDED", null, null, null,
                null, null, null, "tenant-1", null,
                null, null, "MAGIC_CLIENT", "SUCCESS", null,
                null, null, null, null, null, null);

        assertThatThrownBy(() -> service.record(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("source");
        verifyNoInteractions(repository);
    }

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

    @Test
    void searchNormalizesTheCrossFieldQueryForServerSidePagination() {
        AuditLogRepository repository = mock(AuditLogRepository.class);
        AuditService service = new AuditService(repository);
        Pageable pageable = PageRequest.of(0, 50);
        when(repository.search(eq("tenant-1"), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), eq("%cash pickup%"),
                isNull(), isNull(), eq(pageable)))
                .thenReturn(Page.empty(pageable));

        service.search("tenant-1", null, null, null, null, null,
                null, null, "  CASH PICKUP  ", null, null, pageable);

        verify(repository).search(eq("tenant-1"), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), eq("%cash pickup%"),
                isNull(), isNull(), eq(pageable));
    }
}
