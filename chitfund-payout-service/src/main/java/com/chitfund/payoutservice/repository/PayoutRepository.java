package com.chitfund.payoutservice.repository;

import com.chitfund.payoutservice.domain.Payout;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PayoutRepository extends JpaRepository<Payout, UUID> {

    Optional<Payout> findByIdAndTenantId(UUID id, String tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Payout p WHERE p.id = :id AND p.tenantId = :tenantId")
    Optional<Payout> findByIdAndTenantIdForUpdate(@Param("id") UUID id, @Param("tenantId") String tenantId);

    boolean existsByChitIdAndMonthNumberAndStatusNot(UUID chitId, int monthNumber, PayoutStatus status);

    boolean existsByChitIdAndMonthNumberAndStatusNotIn(UUID chitId, int monthNumber, java.util.List<PayoutStatus> statuses);

    boolean existsByChitIdAndMonthNumberAndMemberIdAndStatusNotIn(UUID chitId, int monthNumber, UUID memberId, java.util.List<PayoutStatus> statuses);

    Optional<Payout> findByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    // ── Tenant-scoped list queries ─────────────────────────────────────────────
    List<Payout> findByTenantIdAndStatusInOrderByCreatedAtAsc(String tenantId, List<PayoutStatus> statuses);
    List<Payout> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    @Query("SELECT p FROM Payout p WHERE p.tenantId = :tenantId AND " +
           "((p.createdAt >= :start AND p.createdAt < :end) OR " +
           "(p.disbursedAt >= :start AND p.disbursedAt < :end)) " +
           "ORDER BY p.createdAt DESC")
    List<Payout> findByTenantIdAndTodaysPayouts(@Param("tenantId") String tenantId,
                                                @Param("start") LocalDateTime start,
                                                @Param("end") LocalDateTime end);

    @Query("SELECT p FROM Payout p WHERE p.tenantId = :tenantId " +
           "AND p.createdAt >= :start AND p.createdAt < :end " +
           "AND (:chitId IS NULL OR p.chitId = :chitId) " +
           "ORDER BY p.createdAt DESC")
    List<Payout> findByTenantIdAndDateRange(
            @Param("tenantId") String tenantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("chitId") UUID chitId);

    List<Payout> findByTenantIdAndChitIdOrderByMonthNumberAsc(String tenantId, UUID chitId);
    List<Payout> findByTenantIdAndMemberIdOrderByCreatedAtDesc(String tenantId, UUID memberId);

    // ── Cross-tenant fallbacks (kept for super-admin/internal use) ─────────────
    List<Payout> findByStatusOrderByCreatedAtAsc(PayoutStatus status);
    List<Payout> findByStatusInOrderByCreatedAtAsc(List<PayoutStatus> statuses);
    List<Payout> findByChitIdOrderByMonthNumberAsc(UUID chitId);
    List<Payout> findByMemberIdOrderByCreatedAtDesc(UUID memberId);

    @Query("SELECT p FROM Payout p WHERE " +
           "(p.createdAt >= :start AND p.createdAt < :end) OR " +
           "(p.disbursedAt >= :start AND p.disbursedAt < :end) " +
           "ORDER BY p.createdAt DESC")
    List<Payout> findTodaysPayouts(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

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
