package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.SettlementMemberStatusSync;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface SettlementMemberStatusSyncRepository
        extends JpaRepository<SettlementMemberStatusSync, UUID> {

    @Query("SELECT s.id FROM SettlementMemberStatusSync s "
            + "WHERE ((s.status IN ('PENDING','FAILED') AND s.availableAt <= :now) "
            + "OR (s.status='PROCESSING' AND s.claimedUntil < :now)) "
            + "AND NOT EXISTS (SELECT older.id FROM SettlementMemberStatusSync older "
            + "WHERE older.memberId=s.memberId AND older.createdAt < s.createdAt "
            + "AND older.status <> 'COMPLETED') ORDER BY s.createdAt")
    List<UUID> findReadyIds(@Param("now") LocalDateTime now, Pageable pageable);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE SettlementMemberStatusSync s SET s.status='PROCESSING', "
            + "s.claimedUntil=:leaseUntil, s.claimToken=:claimToken "
            + "WHERE s.id=:id AND ((s.status IN ('PENDING','FAILED') AND s.availableAt <= :now) "
            + "OR (s.status='PROCESSING' AND s.claimedUntil < :now))")
    int claim(@Param("id") UUID id, @Param("now") LocalDateTime now,
              @Param("leaseUntil") LocalDateTime leaseUntil,
              @Param("claimToken") UUID claimToken);
}
