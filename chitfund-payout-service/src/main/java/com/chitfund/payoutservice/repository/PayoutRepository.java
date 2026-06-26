package com.chitfund.payoutservice.repository;

import com.chitfund.payoutservice.domain.Payout;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PayoutRepository extends JpaRepository<Payout, UUID> {

    boolean existsByChitIdAndMonthNumberAndStatusNot(UUID chitId, int monthNumber, PayoutStatus status);

    boolean existsByChitIdAndMonthNumberAndStatusNotIn(UUID chitId, int monthNumber, java.util.List<PayoutStatus> statuses);

    Optional<Payout> findByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    // Admin dashboard: all PENDING payouts — needs to disburse these
    List<Payout> findByStatusOrderByCreatedAtAsc(PayoutStatus status);

    // Pending tab: PENDING + PARTIALLY_DISBURSED together
    List<Payout> findByStatusInOrderByCreatedAtAsc(List<PayoutStatus> statuses);

    // Per-chit view: shows the full disbursement history for a chit
    List<Payout> findByChitIdOrderByMonthNumberAsc(UUID chitId);

    // Member's winning history across all chits
    List<Payout> findByMemberIdOrderByCreatedAtDesc(UUID memberId);

    // Today's activity: created or disbursed today
    @Query("SELECT p FROM Payout p WHERE " +
           "(p.createdAt >= :start AND p.createdAt < :end) OR " +
           "(p.disbursedAt >= :start AND p.disbursedAt < :end) " +
           "ORDER BY p.createdAt DESC")
    List<Payout> findTodaysPayouts(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    // Reports: all payouts in a date range, optionally filtered by chit
    @Query("SELECT p FROM Payout p WHERE " +
           "p.createdAt >= :start AND p.createdAt < :end " +
           "AND (:chitId IS NULL OR p.chitId = :chitId) " +
           "ORDER BY p.createdAt DESC")
    List<Payout> findByDateRange(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("chitId") UUID chitId);

    List<Payout> findAllByOrderByCreatedAtDesc();

    long countByChitIdAndStatus(UUID chitId, PayoutStatus status);
}
