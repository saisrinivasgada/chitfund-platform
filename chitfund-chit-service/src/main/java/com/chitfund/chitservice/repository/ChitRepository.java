package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface ChitRepository extends JpaRepository<Chit, UUID> {

    // ── Tenant-scoped list queries ─────────────────────────────────────────────
    Page<Chit> findByTenantIdAndDeletedAtIsNull(String tenantId, Pageable pageable);
    Page<Chit> findByTenantIdAndStatusAndDeletedAtIsNull(String tenantId, ChitStatus status, Pageable pageable);
    Page<Chit> findByTenantIdAndCreatedByAndDeletedAtIsNull(String tenantId, UUID createdBy, Pageable pageable);

    List<Chit> findByTenantIdAndIdInAndDeletedAtIsNull(String tenantId, Collection<UUID> ids);
    List<Chit> findByTenantIdAndIdInAndStatusAndDeletedAtIsNull(String tenantId, Collection<UUID> ids, ChitStatus status);

    Page<Chit> findByTenantIdAndDeletedAtIsNotNull(String tenantId, Pageable pageable);

    List<Chit> findByTenantIdAndUpdatedAtBetweenAndDeletedAtIsNull(String tenantId, LocalDateTime from, LocalDateTime to);

    long countByTenantIdAndStatusAndDeletedAtIsNull(String tenantId, ChitStatus status);

    // ── Super-admin usage summary ────────────────────────────────────────────────
    @Query("SELECT c.tenantId AS tenantId, COUNT(c) AS activeCount FROM Chit c WHERE c.status = 'ACTIVE' AND c.deletedAt IS NULL GROUP BY c.tenantId")
    List<Map<String, Object>> countActiveChitsByTenant();

    // ── Cross-tenant fallbacks (super-admin only — kept for audit/debug) ───────
    Page<Chit> findByDeletedAtIsNull(Pageable pageable);
    Page<Chit> findByStatusAndDeletedAtIsNull(ChitStatus status, Pageable pageable);
    List<Chit> findByIdInAndDeletedAtIsNull(Collection<UUID> ids);
    List<Chit> findByIdInAndStatusAndDeletedAtIsNull(Collection<UUID> ids, ChitStatus status);
    Page<Chit> findByDeletedAtIsNotNull(Pageable pageable);
    List<Chit> findByUpdatedAtBetweenAndDeletedAtIsNull(LocalDateTime from, LocalDateTime to);
}
