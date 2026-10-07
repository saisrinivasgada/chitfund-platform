package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentIntimation;
import com.chitfund.paymentservice.domain.enums.IntimationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface PaymentIntimationRepository extends JpaRepository<PaymentIntimation, String> {

    List<PaymentIntimation> findByTenantIdAndStatusOrderByCreatedAtDesc(String tenantId, IntimationStatus status);

    List<PaymentIntimation> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    List<PaymentIntimation> findByTenantIdAndMemberIdOrderByCreatedAtDesc(String tenantId, String memberId);

    Optional<PaymentIntimation> findByIdAndTenantId(String id, String tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM PaymentIntimation i WHERE i.id = :id AND i.tenantId = :tenantId")
    Optional<PaymentIntimation> findByIdAndTenantIdForUpdate(
            @Param("id") String id, @Param("tenantId") String tenantId);
}
