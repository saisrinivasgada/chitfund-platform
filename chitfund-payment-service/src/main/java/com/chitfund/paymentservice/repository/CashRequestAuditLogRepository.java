package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.CashRequestAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CashRequestAuditLogRepository extends JpaRepository<CashRequestAuditLog, UUID> {
    List<CashRequestAuditLog> findByRequestIdOrderByPerformedAtAsc(UUID requestId);
}
