package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PlanLimits;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PlanLimitsRepository extends JpaRepository<PlanLimits, String> {

    List<PlanLimits> findByIsPublicTrueAndIsActiveTrueOrderByDisplayOrderAsc();

    List<PlanLimits> findAllByOrderByDisplayOrderAsc();
}
