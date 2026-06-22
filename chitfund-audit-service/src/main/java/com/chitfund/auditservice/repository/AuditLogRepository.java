package com.chitfund.auditservice.repository;

import com.chitfund.auditservice.domain.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {

    Page<AuditLog> findByEntityTypeAndEntityIdOrderByCreatedAtDesc(
            String entityType, String entityId, Pageable pageable);

    Page<AuditLog> findByChitIdOrderByCreatedAtDesc(String chitId, Pageable pageable);

    Page<AuditLog> findByActorIdOrderByCreatedAtDesc(String actorId, Pageable pageable);

    /**
     * Flexible search supporting any combination of filters.
     * All params are optional — null means "don't filter on this field."
     *
     * WHY JPQL instead of Specification/QueryDSL?
     * Four optional filters doesn't warrant the extra dependency.
     * This query is readable and covers 95% of admin investigation use cases.
     */
    @Query("""
            SELECT a FROM AuditLog a
            WHERE (:entityType IS NULL OR a.entityType = :entityType)
            AND   (:entityId   IS NULL OR a.entityId   = :entityId)
            AND   (:chitId     IS NULL OR a.chitId     = :chitId)
            AND   (:actorId    IS NULL OR a.actorId    = :actorId)
            AND   (:action     IS NULL OR a.action     = :action)
            AND   (:from       IS NULL OR a.createdAt >= :from)
            AND   (:to         IS NULL OR a.createdAt <= :to)
            ORDER BY a.createdAt DESC
            """)
    Page<AuditLog> search(
            @Param("entityType") String entityType,
            @Param("entityId")   String entityId,
            @Param("chitId")     String chitId,
            @Param("actorId")    String actorId,
            @Param("action")     String action,
            @Param("from")       Instant from,
            @Param("to")         Instant to,
            Pageable pageable);
}
