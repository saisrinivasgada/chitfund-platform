package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PlanPayment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanPaymentRepository extends JpaRepository<PlanPayment, String> {

    Page<PlanPayment> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    Page<PlanPayment> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<PlanPayment> findByTenantIdOrderByCreatedAtDesc(String tenantId);
}
