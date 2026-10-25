package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.ChitLifecycleCommand;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ChitLifecycleCommandRepository
        extends JpaRepository<ChitLifecycleCommand, UUID> {

    @Query("SELECT c.id FROM ChitLifecycleCommand c WHERE "
            + "((c.status IN ('PENDING','RETRY') AND c.availableAt <= :now) "
            + "OR (c.status='PROCESSING' AND c.claimedUntil < :now)) "
            + "ORDER BY c.createdAt, c.id")
    List<UUID> findReadyIds(@Param("now") LocalDateTime now, Pageable pageable);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE ChitLifecycleCommand c SET c.status='PROCESSING', "
            + "c.claimedUntil=:leaseUntil, c.claimToken=:claimToken "
            + "WHERE c.id=:id AND ((c.status IN ('PENDING','RETRY') AND c.availableAt <= :now) "
            + "OR (c.status='PROCESSING' AND c.claimedUntil < :now))")
    int claim(@Param("id") UUID id, @Param("now") LocalDateTime now,
              @Param("leaseUntil") LocalDateTime leaseUntil,
              @Param("claimToken") UUID claimToken);

    List<ChitLifecycleCommand> findByTenantIdAndChitIdOrderByCreatedAt(
            String tenantId, UUID chitId);

    java.util.Optional<ChitLifecycleCommand> findByTenantIdAndDedupeKey(String tenantId, String dedupeKey);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM ChitLifecycleCommand c WHERE c.id=:id")
    java.util.Optional<ChitLifecycleCommand> findByIdForUpdate(@Param("id") UUID id);

    long countByStatus(String status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE ChitLifecycleCommand c SET c.status='RETRY', c.attempts=0, "
            + "c.availableAt=:now, c.claimedUntil=NULL, c.claimToken=NULL "
            + "WHERE c.tenantId=:tenantId AND c.chitId=:chitId AND c.status='FAILED'")
    int retryFailed(@Param("tenantId") String tenantId, @Param("chitId") UUID chitId,
                    @Param("now") LocalDateTime now);
}
