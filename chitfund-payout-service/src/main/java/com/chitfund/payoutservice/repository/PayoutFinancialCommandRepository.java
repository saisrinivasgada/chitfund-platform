package com.chitfund.payoutservice.repository;

import com.chitfund.payoutservice.domain.PayoutFinancialCommand;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface PayoutFinancialCommandRepository
        extends JpaRepository<PayoutFinancialCommand, UUID> {

    @Query("SELECT COALESCE(MAX(c.sequenceNo), 0) FROM PayoutFinancialCommand c "
            + "WHERE c.payoutId=:payoutId")
    long findMaxSequence(@Param("payoutId") UUID payoutId);

    @Query("SELECT c.id FROM PayoutFinancialCommand c "
            + "WHERE ((c.status IN ('PENDING','RETRY') AND c.availableAt <= :now) "
            + "OR (c.status='PROCESSING' AND c.claimedUntil < :now)) "
            + "AND NOT EXISTS (SELECT older.id FROM PayoutFinancialCommand older "
            + "WHERE older.payoutId=c.payoutId AND older.sequenceNo < c.sequenceNo "
            + "AND older.status <> 'COMPLETED') ORDER BY c.createdAt, c.id")
    List<UUID> findReadyIds(@Param("now") LocalDateTime now, Pageable pageable);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PayoutFinancialCommand c SET c.status='PROCESSING', "
            + "c.claimedUntil=:leaseUntil, c.claimToken=:claimToken "
            + "WHERE c.id=:id AND ((c.status IN ('PENDING','RETRY') AND c.availableAt <= :now) "
            + "OR (c.status='PROCESSING' AND c.claimedUntil < :now))")
    int claim(@Param("id") UUID id, @Param("now") LocalDateTime now,
              @Param("leaseUntil") LocalDateTime leaseUntil,
              @Param("claimToken") UUID claimToken);

    long countByPayoutId(UUID payoutId);

    long countByPayoutIdAndStatusNot(UUID payoutId, String status);

    boolean existsByPayoutIdAndStatus(UUID payoutId, String status);

    List<PayoutFinancialCommand> findByPayoutIdOrderBySequenceNo(UUID payoutId);

    long countByStatus(String status);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE PayoutFinancialCommand c SET c.status='RETRY', c.attempts=0, "
            + "c.availableAt=:now, c.claimedUntil=NULL, c.claimToken=NULL "
            + "WHERE c.payoutId=:payoutId AND c.status='FAILED'")
    int retryFailed(@Param("payoutId") UUID payoutId, @Param("now") LocalDateTime now);
}
