package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentAllocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentAllocationRepository extends JpaRepository<PaymentAllocation, UUID> {

    List<PaymentAllocation> findByBatchId(UUID batchId);

    List<PaymentAllocation> findByBatchIdIn(List<UUID> batchIds);

    List<PaymentAllocation> findByPaymentRecordId(UUID paymentRecordId);

    List<PaymentAllocation> findByPaymentRecordIdIn(List<UUID> paymentRecordIds);

    void deleteByPaymentRecordIdIn(List<UUID> paymentRecordIds);

    // Find all distinct batchIds that have at least one allocation for this member+chit.
    // This catches cross-chit spill: a Chit-1 batch that also allocated into Chit-2.
    @org.springframework.data.jpa.repository.Query(
        "SELECT DISTINCT a.batchId FROM PaymentAllocation a WHERE a.memberId = :memberId AND a.chitId = :chitId")
    List<UUID> findBatchIdsWithAllocationsForChit(
            @org.springframework.data.repository.query.Param("memberId") UUID memberId,
            @org.springframework.data.repository.query.Param("chitId") UUID chitId);
}
