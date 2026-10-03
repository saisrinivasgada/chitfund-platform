package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentIntimationAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentIntimationAuditLogRepository extends JpaRepository<PaymentIntimationAuditLog, UUID> {
    List<PaymentIntimationAuditLog> findByIntimationIdOrderByPerformedAtAsc(String intimationId);
}
