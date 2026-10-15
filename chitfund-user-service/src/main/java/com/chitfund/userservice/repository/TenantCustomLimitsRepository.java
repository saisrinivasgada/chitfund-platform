package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.TenantCustomLimits;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TenantCustomLimitsRepository extends JpaRepository<TenantCustomLimits, String> {
    List<TenantCustomLimits> findAllByPlanCode(String planCode);
}
