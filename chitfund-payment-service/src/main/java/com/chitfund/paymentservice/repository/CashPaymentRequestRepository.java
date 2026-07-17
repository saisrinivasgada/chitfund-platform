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
    @Query("SELECT r FROM CashPaymentRequest r WHERE r.id = :id")
    Optional<CashPaymentRequest> findByIdForUpdate(@Param("id") UUID id);

    List<CashPaymentRequest> findByStatusOrderByRequestedAtAsc(CashRequestStatus status);

    List<CashPaymentRequest> findByStatusInOrderByRequestedAtAsc(List<CashRequestStatus> statuses);

    // Staff view: active tasks — ASSIGNED (not yet picked up) + PICKED_UP (picked up, awaiting admin confirm)
    List<CashPaymentRequest> findByAssignedStaffIdAndStatusInOrderByAssignedAtAsc(UUID staffId, List<CashRequestStatus> statuses);

    // Member view: their own requests
    List<CashPaymentRequest> findByMemberIdOrderByRequestedAtDesc(UUID memberId);

    // Admin view: full history for a specific staff member (all statuses, newest first)
    List<CashPaymentRequest> findByAssignedStaffIdOrderByRequestedAtDesc(UUID staffId);

    // Staff view: their own history — COLLECTED and CANCELLED (not ASSIGNED — those are active)
    List<CashPaymentRequest> findByAssignedStaffIdAndStatusInOrderByUpdatedAtDesc(UUID staffId, List<CashRequestStatus> statuses);

    long countByStatus(CashRequestStatus status);

    @Query("SELECT COUNT(r) FROM CashPaymentRequest r WHERE r.status = :status AND r.updatedAt >= :start")
    long countByStatusAndUpdatedAtAfter(@Param("status") CashRequestStatus status, @Param("start") LocalDateTime start);

    @Query("SELECT COUNT(r) FROM CashPaymentRequest r WHERE r.requestedAt >= :start")
    long countRequestedAfter(@Param("start") LocalDateTime start);

    List<CashPaymentRequest> findByStatusOrderByUpdatedAtDesc(CashRequestStatus status);
}
