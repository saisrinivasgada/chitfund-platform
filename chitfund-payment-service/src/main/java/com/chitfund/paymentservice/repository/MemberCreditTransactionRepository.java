package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.MemberCreditTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MemberCreditTransactionRepository extends JpaRepository<MemberCreditTransaction, UUID> {
    List<MemberCreditTransaction> findByTenantIdAndMemberIdOrderByCreatedAtDesc(String tenantId, UUID memberId);
    List<MemberCreditTransaction> findByTenantIdAndSourceBatchId(String tenantId, UUID sourceBatchId);
    List<MemberCreditTransaction> findByTenantIdAndSourceSettlementId(String tenantId, UUID sourceSettlementId);
    boolean existsByTenantIdAndReversalOfId(String tenantId, UUID reversalOfId);
}
