package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.SettlementAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SettlementAuditEventRepository extends JpaRepository<SettlementAuditEvent, UUID> {
}
