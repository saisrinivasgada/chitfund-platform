package com.chitfund.auditservice.repository;

import com.chitfund.auditservice.domain.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {

    @Query("""
            SELECT a FROM AuditLog a
            WHERE a.entityType = :entityType AND a.entityId = :entityId
            AND   (:tenantId IS NULL OR a.tenantId = :tenantId)
            ORDER BY a.createdAt DESC
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
            ORDER BY a.createdAt DESC
            """)
    Page<AuditLog> findByChitId(
            @Param("chitId")   String chitId,
            @Param("tenantId") String tenantId,
            Pageable pageable);

    @Query("""
            SELECT a FROM AuditLog a
            WHERE a.actorId = :actorId
            AND   (:tenantId IS NULL OR a.tenantId = :tenantId)
            ORDER BY a.createdAt DESC
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
            AND   (:from       IS NULL OR a.createdAt >= :from)
            AND   (:to         IS NULL OR a.createdAt <= :to)
            ORDER BY a.createdAt DESC
            """)
    Page<AuditLog> search(
            @Param("tenantId")   String tenantId,
            @Param("entityType") String entityType,
            @Param("entityId")   String entityId,
            @Param("chitId")     String chitId,
            @Param("actorId")    String actorId,
            @Param("action")     String action,
            @Param("from")       Instant from,
            @Param("to")         Instant to,
            Pageable pageable);
}
