package com.chitfund.auditservice.repository;

import com.chitfund.auditservice.domain.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.repository.Repository;

import java.time.Instant;

/**
 * Deliberately exposes no update or delete operation. Audit history is append-only;
 * callers may insert records and query immutable projections only.
 */
public interface AuditLogRepository extends Repository<AuditLog, String> {

    <S extends AuditLog> S save(S entity);

    <S extends AuditLog> Iterable<S> saveAll(Iterable<S> entities);

    @Query("""
            SELECT a FROM AuditLog a
            WHERE a.entityType = :entityType AND a.entityId = :entityId
            AND   (:tenantId IS NULL OR a.tenantId = :tenantId)
            ORDER BY a.occurredAt DESC, a.id DESC
            """)
    Page<AuditLog> findByEntityTypeAndEntityId(
            @Param("entityType") String entityType,
            @Param("entityId")   String entityId,
            @Param("tenantId")   String tenantId,
            Pageable pageable);

    @Query("""
            SELECT a FROM AuditLog a
            WHERE a.chitId = :chitId
            AND   (:tenantId IS NULL OR a.tenantId = :tenantId)
            ORDER BY a.occurredAt DESC, a.id DESC
            """)
    Page<AuditLog> findByChitId(
            @Param("chitId")   String chitId,
            @Param("tenantId") String tenantId,
            Pageable pageable);

    @Query("""
            SELECT a FROM AuditLog a
            WHERE a.actorId = :actorId
            AND   (:tenantId IS NULL OR a.tenantId = :tenantId)
            ORDER BY a.occurredAt DESC, a.id DESC
            """)
    Page<AuditLog> findByActorId(
            @Param("actorId")  String actorId,
            @Param("tenantId") String tenantId,
            Pageable pageable);

    @Query("""
            SELECT a FROM AuditLog a
            WHERE (:tenantId   IS NULL OR a.tenantId   = :tenantId)
            AND   (:entityType IS NULL OR a.entityType = :entityType)
            AND   (:entityId   IS NULL OR a.entityId   = :entityId)
            AND   (:chitId     IS NULL OR a.chitId     = :chitId)
            AND   (:actorId    IS NULL OR a.actorId    = :actorId)
            AND   (:action     IS NULL OR a.action     = :action)
            AND   (:source     IS NULL OR a.source     = :source)
            AND   (:outcome    IS NULL OR a.outcome    = :outcome)
            AND   (:query      IS NULL OR
                   LOWER(a.action) LIKE :query OR
                   LOWER(a.entityType) LIKE :query OR
                   LOWER(a.entityId) LIKE :query OR
                   LOWER(a.chitId) LIKE :query OR
                   LOWER(a.actorId) LIKE :query OR
                   LOWER(a.actorRole) LIKE :query OR
                   LOWER(a.reason) LIKE :query OR
                   LOWER(a.metadata) LIKE :query)
            AND   (:from       IS NULL OR a.occurredAt >= :from)
            AND   (:to         IS NULL OR a.occurredAt <= :to)
            ORDER BY a.occurredAt DESC, a.id DESC
            """)
    Page<AuditLog> search(
            @Param("tenantId")   String tenantId,
            @Param("entityType") String entityType,
            @Param("entityId")   String entityId,
            @Param("chitId")     String chitId,
            @Param("actorId")    String actorId,
            @Param("action")     String action,
            @Param("source")     String source,
            @Param("outcome")    String outcome,
            @Param("query")      String query,
            @Param("from")       Instant from,
            @Param("to")         Instant to,
            Pageable pageable);
}
