package com.chitfund.auditservice.service;

import com.chitfund.auditservice.domain.AuditLog;
import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.dto.AuditLogResponse;
import com.chitfund.auditservice.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    private static final Set<String> VALID_SOURCES = Set.of(
            "WEB", "MOBILE", "OFFLINE_SYNC", "INTERNAL_API", "WORKER", "SYSTEM", "UNKNOWN");
    private static final Set<String> VALID_OUTCOMES = Set.of("SUCCESS", "FAILURE", "DENIED");

    private final AuditLogRepository auditLogRepository;

    private AuditLog buildLog(AuditLogRequest req) {
        String tenantId = requireTenant(req.tenantId());
        Instant recordedAt = Instant.now();
        return AuditLog.builder()
                .id(resolveEventId(req.eventId()))
                .tenantId(tenantId)
                .serviceName(req.serviceName())
                .entityType(req.entityType())
                .entityId(req.entityId())
                .chitId(req.chitId())
                .action(req.action())
                .actorId(req.actorId())
                .actorRole(req.actorRole())
                .actorIp(req.actorIp())
                .beforeState(req.beforeState())
                .afterState(req.afterState())
                .metadata(req.metadata())
                .correlationId(req.correlationId())
                .idempotencyKey(req.idempotencyKey())
                .source(normalizeAllowed(req.source(), "UNKNOWN", VALID_SOURCES, "source"))
                .outcome(normalizeAllowed(req.outcome(), "SUCCESS", VALID_OUTCOMES, "outcome"))
                .reason(req.reason())
                .effectiveActorId(req.effectiveActorId())
                .effectiveActorRole(req.effectiveActorRole())
                .deviceSessionHash(req.deviceSessionHash())
                .occurredAt(req.occurredAt() != null ? req.occurredAt() : recordedAt)
                .originalOfflineAt(req.originalOfflineAt())
                .synchronizedAt(req.synchronizedAt())
                .createdAt(recordedAt)
                .build();
    }

    private String resolveEventId(String eventId) {
        if (eventId == null || eventId.isBlank()) return UUID.randomUUID().toString();
        String canonical = UUID.fromString(eventId).toString();
        if (!canonical.equals(eventId.toLowerCase(java.util.Locale.ROOT))) {
            throw new IllegalArgumentException("eventId must be a canonical UUID");
        }
        return canonical;
    }

    private String normalizeAllowed(String value, String fallback, Set<String> allowed,
                                    String fieldName) {
        String normalized = value == null || value.isBlank()
                ? fallback
                : value.trim().toUpperCase(Locale.ROOT);
        if (!allowed.contains(normalized)) {
            throw new IllegalArgumentException(fieldName + " has an unsupported value");
        }
        return normalized;
    }

    private String requireTenant(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("tenantId is required for every audit record");
        }
        return tenantId;
    }

    @Transactional
    public void record(AuditLogRequest req) {
        auditLogRepository.save(buildLog(req));
    }

    @Transactional
    public void recordBatch(List<AuditLogRequest> requests) {
        List<AuditLog> logs = requests.stream().map(this::buildLog).toList();
        auditLogRepository.saveAll(logs);
        log.info("Recorded {} audit events in batch", logs.size());
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> search(String tenantId, String entityType, String entityId,
                                         String chitId, String actorId, String action,
                                         Instant from, Instant to, Pageable pageable) {
        return search(tenantId, entityType, entityId, chitId, actorId, action,
                null, null, null, from, to, pageable);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> search(String tenantId, String entityType, String entityId,
                                         String chitId, String actorId, String action,
                                         String source, String outcome,
                                         Instant from, Instant to, Pageable pageable) {
        return search(tenantId, entityType, entityId, chitId, actorId, action,
                source, outcome, null, from, to, pageable);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> search(String tenantId, String entityType, String entityId,
                                         String chitId, String actorId, String action,
                                         String source, String outcome, String query,
                                         Instant from, Instant to, Pageable pageable) {
        String normalizedQuery = normalizeSearchQuery(query);
        return auditLogRepository
                .search(tenantId, entityType, entityId, chitId, actorId, action,
                        source, outcome, normalizedQuery, from, to, pageable)
                .map(AuditLogResponse::from);
    }

    private String normalizeSearchQuery(String query) {
        if (query == null || query.isBlank()) return null;
        String normalized = query.trim();
        if (normalized.length() > 100) {
            throw new IllegalArgumentException("audit search must be at most 100 characters");
        }
        return "%" + normalized.toLowerCase(Locale.ROOT) + "%";
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getEntityHistory(String entityType, String entityId,
                                                    String tenantId, Pageable pageable) {
        return auditLogRepository
                .findByEntityTypeAndEntityId(entityType, entityId, tenantId, pageable)
                .map(AuditLogResponse::from);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getChitHistory(String chitId, String tenantId, Pageable pageable) {
        return auditLogRepository
                .findByChitId(chitId, tenantId, pageable)
                .map(AuditLogResponse::from);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getActorHistory(String actorId, String tenantId, Pageable pageable) {
        return auditLogRepository
                .findByActorId(actorId, tenantId, pageable)
                .map(AuditLogResponse::from);
    }
}
