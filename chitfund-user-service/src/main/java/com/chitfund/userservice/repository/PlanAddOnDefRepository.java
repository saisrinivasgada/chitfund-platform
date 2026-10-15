package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PlanAddOnDef;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanAddOnDefRepository extends JpaRepository<PlanAddOnDef, String> {
    List<PlanAddOnDef> findAllByOrderBySortOrderAscLabelAsc();
    boolean existsByLabel(String label);
}
