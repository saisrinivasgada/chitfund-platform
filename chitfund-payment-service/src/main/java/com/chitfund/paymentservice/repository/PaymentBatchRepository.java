package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.enums.BatchStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Optional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface PaymentBatchRepository extends JpaRepository<PaymentBatch, UUID> {

    Optional<PaymentBatch> findByIdempotencyKey(String idempotencyKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM PaymentBatch b WHERE b.id = :id")
    Optional<PaymentBatch> findByIdForUpdate(@Param("id") UUID id);

    // ── Tenant-scoped list queries (primary paths) ────────────────────────────

    List<PaymentBatch> findByTenantIdAndStatusOrderByCreatedAtAsc(String tenantId, BatchStatus status);

    List<PaymentBatch> findByTenantIdAndMemberIdAndChitIdOrderByCreatedAtDesc(String tenantId, UUID memberId, UUID chitId);
    List<PaymentBatch> findByTenantIdAndChitIdOrderByCreatedAtDesc(String tenantId, UUID chitId);
    List<PaymentBatch> findByTenantIdAndMemberIdOrderByCreatedAtDesc(String tenantId, UUID memberId);
    List<PaymentBatch> findByTenantIdAndChitIdAndMemberIdOrderByCreatedAtDesc(String tenantId, UUID chitId, UUID memberId);
    List<PaymentBatch> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    Page<PaymentBatch> findByTenantIdAndChitIdOrderByCreatedAtDesc(String tenantId, UUID chitId, Pageable pageable);
    Page<PaymentBatch> findByTenantIdAndMemberIdOrderByCreatedAtDesc(String tenantId, UUID memberId, Pageable pageable);
    Page<PaymentBatch> findByTenantIdAndChitIdAndMemberIdOrderByCreatedAtDesc(String tenantId, UUID chitId, UUID memberId, Pageable pageable);
    Page<PaymentBatch> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    List<PaymentBatch> findByTenantIdAndCollectedByAndStatusOrderByCollectedAtDesc(String tenantId, UUID collectedBy, BatchStatus status);
    List<PaymentBatch> findByTenantIdAndCollectedByOrderByCreatedAtDesc(String tenantId, UUID collectedBy);

    @Query("SELECT b FROM PaymentBatch b WHERE b.tenantId = :tenantId AND (" +
           "(b.createdAt >= :start AND b.createdAt < :end) OR " +
           "(b.remittedAt >= :start AND b.remittedAt < :end) OR " +
           "(b.voidedAt >= :start AND b.voidedAt < :end)) " +
           "ORDER BY b.createdAt DESC")
    List<PaymentBatch> findTodaysActivityByTenant(
            @Param("tenantId") String tenantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);

    @Query("SELECT b FROM PaymentBatch b WHERE b.tenantId = :tenantId AND " +
           "b.createdAt >= :start AND b.createdAt < :end " +
           "AND (:chitId IS NULL OR b.chitId = :chitId) " +
           "AND (:memberId IS NULL OR b.memberId = :memberId) " +
           "ORDER BY b.createdAt DESC")
    List<PaymentBatch> findByTenantAndDateRange(
            @Param("tenantId") String tenantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("chitId") UUID chitId,
            @Param("memberId") UUID memberId);

    @Query("SELECT b FROM PaymentBatch b WHERE b.tenantId = :tenantId AND " +
           "b.createdAt >= :start AND b.createdAt < :end " +
           "AND (:chitId IS NULL OR b.chitId = :chitId) " +
           "AND (:memberId IS NULL OR b.memberId = :memberId) " +
           "ORDER BY b.createdAt DESC")
    Page<PaymentBatch> findByTenantAndDateRangePaged(
            @Param("tenantId") String tenantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("chitId") UUID chitId,
            @Param("memberId") UUID memberId,
            Pageable pageable);

    // ── Cross-tenant fallbacks (super-admin only) ─────────────────────────────

    List<PaymentBatch> findByStatusOrderByCreatedAtAsc(BatchStatus status);
    List<PaymentBatch> findByMemberIdAndChitIdOrderByCreatedAtDesc(UUID memberId, UUID chitId);
    List<PaymentBatch> findByChitIdOrderByCreatedAtDesc(UUID chitId);
    List<PaymentBatch> findByMemberIdOrderByCreatedAtDesc(UUID memberId);
    List<PaymentBatch> findByChitIdAndMemberIdOrderByCreatedAtDesc(UUID chitId, UUID memberId);
    List<PaymentBatch> findAllByOrderByCreatedAtDesc();

    Page<PaymentBatch> findByChitIdOrderByCreatedAtDesc(UUID chitId, Pageable pageable);
    Page<PaymentBatch> findByMemberIdOrderByCreatedAtDesc(UUID memberId, Pageable pageable);
    Page<PaymentBatch> findByChitIdAndMemberIdOrderByCreatedAtDesc(UUID chitId, UUID memberId, Pageable pageable);
    Page<PaymentBatch> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<PaymentBatch> findByCollectedByAndStatusOrderByCollectedAtDesc(UUID collectedBy, BatchStatus status);
    List<PaymentBatch> findByCollectedByOrderByCreatedAtDesc(UUID collectedBy);

    @Query("SELECT b FROM PaymentBatch b WHERE " +
           "(b.createdAt >= :start AND b.createdAt < :end) OR " +
           "(b.remittedAt >= :start AND b.remittedAt < :end) OR " +
           "(b.voidedAt >= :start AND b.voidedAt < :end) " +
           "ORDER BY b.createdAt DESC")
    List<PaymentBatch> findTodaysActivity(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("SELECT b FROM PaymentBatch b WHERE " +
           "b.createdAt >= :start AND b.createdAt < :end " +
           "AND (:chitId IS NULL OR b.chitId = :chitId) " +
           "AND (:memberId IS NULL OR b.memberId = :memberId) " +
           "ORDER BY b.createdAt DESC")
    List<PaymentBatch> findByDateRange(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("chitId") UUID chitId,
            @Param("memberId") UUID memberId);

    @Query("SELECT b FROM PaymentBatch b WHERE " +
           "b.createdAt >= :start AND b.createdAt < :end " +
           "AND (:chitId IS NULL OR b.chitId = :chitId) " +
           "AND (:memberId IS NULL OR b.memberId = :memberId) " +
           "ORDER BY b.createdAt DESC")
    Page<PaymentBatch> findByDateRangePaged(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("chitId") UUID chitId,
            @Param("memberId") UUID memberId,
            Pageable pageable);
}
