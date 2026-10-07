package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PlanLimits;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PlanLimitsRepository extends JpaRepository<PlanLimits, String> {

    List<PlanLimits> findByIsPublicTrueAndIsActiveTrueOrderByDisplayOrderAsc();

    List<PlanLimits> findAllByOrderByDisplayOrderAsc();

    /**
     * Serializes control-plane mutations of a plan. Without a database lock,
     * concurrent Super Admin updates can both report success while the last
     * commit silently overwrites the first update and its propagated tenant
     * defaults.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PlanLimits p where p.plan = :plan")
    Optional<PlanLimits> findByPlanForUpdate(@Param("plan") String plan);
}
