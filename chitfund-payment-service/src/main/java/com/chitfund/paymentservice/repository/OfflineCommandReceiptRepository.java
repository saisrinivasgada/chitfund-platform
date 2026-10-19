package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.OfflineCommandReceipt;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface OfflineCommandReceiptRepository extends JpaRepository<OfflineCommandReceipt, UUID> {
    Optional<OfflineCommandReceipt> findByTenantIdAndActorIdAndOperationId(String tenantId, UUID actorId, String operationId);
    Optional<OfflineCommandReceipt> findFirstByTenantIdAndRequestIdOrderBySynchronizedAtDesc(String tenantId, UUID requestId);
}
