package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.TenantDiscount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

public interface TenantDiscountRepository extends JpaRepository<TenantDiscount, String> {

    Optional<TenantDiscount> findByTenantId(String tenantId);

    @Transactional
    void deleteByTenantId(String tenantId);
}
