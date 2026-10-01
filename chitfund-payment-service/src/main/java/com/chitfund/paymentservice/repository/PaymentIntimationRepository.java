package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentIntimation;
import com.chitfund.paymentservice.domain.enums.IntimationStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaymentIntimationRepository extends JpaRepository<PaymentIntimation, String> {

    List<PaymentIntimation> findByTenantIdAndStatusOrderByCreatedAtDesc(String tenantId, IntimationStatus status);

    List<PaymentIntimation> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    List<PaymentIntimation> findByTenantIdAndMemberIdOrderByCreatedAtDesc(String tenantId, String memberId);
}
