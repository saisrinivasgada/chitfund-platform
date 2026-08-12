package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PlanReceipt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlanReceiptRepository extends JpaRepository<PlanReceipt, String> {

    List<PlanReceipt> findByPaymentId(String paymentId);

    List<PlanReceipt> findByTenantIdOrderByIssuedAtDesc(String tenantId);

    Optional<PlanReceipt> findByPaymentIdAndType(String paymentId, String type);
}
