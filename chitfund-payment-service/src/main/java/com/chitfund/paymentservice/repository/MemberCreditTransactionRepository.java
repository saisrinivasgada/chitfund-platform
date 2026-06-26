package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.MemberCreditTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MemberCreditTransactionRepository extends JpaRepository<MemberCreditTransaction, UUID> {
    List<MemberCreditTransaction> findByMemberIdOrderByCreatedAtDesc(UUID memberId);
    List<MemberCreditTransaction> findBySourceBatchId(UUID sourceBatchId);
}
