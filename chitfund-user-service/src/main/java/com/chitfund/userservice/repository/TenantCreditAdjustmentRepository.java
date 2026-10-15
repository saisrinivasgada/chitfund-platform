package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.TenantCreditAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TenantCreditAdjustmentRepository
        extends JpaRepository<TenantCreditAdjustment, String> {
    Optional<TenantCreditAdjustment> findByIdempotencyKey(String idempotencyKey);
}
