package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PlanCapabilityDef;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanCapabilityDefRepository extends JpaRepository<PlanCapabilityDef, String> {
    List<PlanCapabilityDef> findAllByOrderBySortOrderAscLabelAsc();
    boolean existsByLabel(String label);
}
