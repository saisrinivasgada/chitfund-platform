package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.PlanPayment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface PlanPaymentRepository extends JpaRepository<PlanPayment, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM PlanPayment p WHERE p.id = :id")
    Optional<PlanPayment> findByIdForUpdate(@Param("id") String id);

    Page<PlanPayment> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    Page<PlanPayment> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<PlanPayment> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    Optional<PlanPayment> findByIdempotencyKey(String idempotencyKey);
}
