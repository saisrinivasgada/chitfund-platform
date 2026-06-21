package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.enums.BatchStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface PaymentBatchRepository extends JpaRepository<PaymentBatch, UUID> {

    // Admin dashboard: show all cash collections waiting to be remitted
    List<PaymentBatch> findByStatusOrderByCreatedAtAsc(BatchStatus status);

    // Member payment history for a specific chit
    List<PaymentBatch> findByMemberIdAndChitIdOrderByCreatedAtDesc(UUID memberId, UUID chitId);

    // Admin history tab: all batches for a chit, or all batches across all chits
    List<PaymentBatch> findByChitIdOrderByCreatedAtDesc(UUID chitId);
    List<PaymentBatch> findByMemberIdOrderByCreatedAtDesc(UUID memberId);
    List<PaymentBatch> findByChitIdAndMemberIdOrderByCreatedAtDesc(UUID chitId, UUID memberId);
    List<PaymentBatch> findAllByOrderByCreatedAtDesc();

    // Worker view: AWAITING_REMITTANCE batches where they are the collector
    List<PaymentBatch> findByCollectedByAndStatusOrderByCollectedAtDesc(UUID collectedBy, BatchStatus status);

    // Staff detail: all batches (any status) where a person was the collector
    List<PaymentBatch> findByCollectedByOrderByCreatedAtDesc(UUID collectedBy);

    // Today's activity: batches created, remitted, or voided today
    @Query("SELECT b FROM PaymentBatch b WHERE " +
           "(b.createdAt >= :start AND b.createdAt < :end) OR " +
           "(b.remittedAt >= :start AND b.remittedAt < :end) OR " +
           "(b.voidedAt >= :start AND b.voidedAt < :end) " +
           "ORDER BY b.createdAt DESC")
    List<PaymentBatch> findTodaysActivity(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
