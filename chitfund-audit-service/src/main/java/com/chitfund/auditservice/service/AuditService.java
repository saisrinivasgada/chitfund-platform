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
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    @Transactional
    public void record(AuditLogRequest req) {
        AuditLog log = AuditLog.builder()
                .id(UUID.randomUUID().toString())
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
                .createdAt(Instant.now())
                .build();

        auditLogRepository.save(log);
    }

    @Transactional
    public void recordBatch(List<AuditLogRequest> requests) {
        List<AuditLog> logs = requests.stream().map(req ->
                AuditLog.builder()
                        .id(UUID.randomUUID().toString())
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
                        .createdAt(Instant.now())
                        .build()
        ).toList();

        auditLogRepository.saveAll(logs);
        log.info("Recorded {} audit events in batch", logs.size());
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> search(String entityType, String entityId, String chitId,
                                         String actorId, String action,
                                         Instant from, Instant to, Pageable pageable) {
        return auditLogRepository
                .search(entityType, entityId, chitId, actorId, action, from, to, pageable)
                .map(AuditLogResponse::from);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getEntityHistory(String entityType, String entityId, Pageable pageable) {
        return auditLogRepository
                .findByEntityTypeAndEntityIdOrderByCreatedAtDesc(entityType, entityId, pageable)
                .map(AuditLogResponse::from);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getChitHistory(String chitId, Pageable pageable) {
        return auditLogRepository
                .findByChitIdOrderByCreatedAtDesc(chitId, pageable)
                .map(AuditLogResponse::from);
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> getActorHistory(String actorId, Pageable pageable) {
        return auditLogRepository
                .findByActorIdOrderByCreatedAtDesc(actorId, pageable)
                .map(AuditLogResponse::from);
    }
}
