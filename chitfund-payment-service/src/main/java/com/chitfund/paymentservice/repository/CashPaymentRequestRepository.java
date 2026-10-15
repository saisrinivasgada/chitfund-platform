package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.CashPaymentRequest;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CashPaymentRequestRepository extends JpaRepository<CashPaymentRequest, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM CashPaymentRequest r WHERE r.id = :id AND r.tenantId = :tenantId")
    Optional<CashPaymentRequest> findByIdAndTenantIdForUpdate(@Param("id") UUID id, @Param("tenantId") String tenantId);

    /** Scoped single-row read. Use instead of findById so one org cannot read another's request. */
    Optional<CashPaymentRequest> findByIdAndTenantId(UUID id, String tenantId);

    // ── Tenant-scoped queries (use for all public/admin endpoints) ───────────────
    List<CashPaymentRequest> findByTenantIdAndStatusOrderByRequestedAtAsc(String tenantId, CashRequestStatus status);

    List<CashPaymentRequest> findByTenantIdAndStatusInOrderByRequestedAtAsc(String tenantId, List<CashRequestStatus> statuses);

    List<CashPaymentRequest> findByTenantIdAndAssignedStaffIdAndStatusInOrderByAssignedAtAsc(String tenantId, UUID staffId, List<CashRequestStatus> statuses);

    List<CashPaymentRequest> findByTenantIdAndMemberIdOrderByRequestedAtDesc(String tenantId, UUID memberId);

    List<CashPaymentRequest> findByTenantIdAndAssignedStaffIdOrderByRequestedAtDesc(String tenantId, UUID staffId);

    List<CashPaymentRequest> findByTenantIdAndAssignedStaffIdAndStatusInOrderByUpdatedAtDesc(String tenantId, UUID staffId, List<CashRequestStatus> statuses);

    long countByTenantIdAndStatus(String tenantId, CashRequestStatus status);

    @Query("SELECT COUNT(r) FROM CashPaymentRequest r WHERE r.tenantId = :tenantId AND r.status = :status AND r.updatedAt >= :start")
    long countByTenantIdAndStatusAndUpdatedAtAfter(@Param("tenantId") String tenantId, @Param("status") CashRequestStatus status, @Param("start") LocalDateTime start);

    @Query("SELECT COUNT(r) FROM CashPaymentRequest r WHERE r.tenantId = :tenantId AND r.requestedAt >= :start")
    long countByTenantIdAndRequestedAtAfter(@Param("tenantId") String tenantId, @Param("start") LocalDateTime start);

    List<CashPaymentRequest> findByTenantIdAndStatusOrderByUpdatedAtDesc(String tenantId, CashRequestStatus status);

}
