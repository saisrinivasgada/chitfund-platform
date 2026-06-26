package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.CashPaymentRequest;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CashPaymentRequestRepository extends JpaRepository<CashPaymentRequest, UUID> {

    List<CashPaymentRequest> findByStatusOrderByRequestedAtAsc(CashRequestStatus status);

    List<CashPaymentRequest> findByStatusInOrderByRequestedAtAsc(List<CashRequestStatus> statuses);

    // Worker view: active tasks — ASSIGNED (not yet picked up) + PICKED_UP (picked up, awaiting admin confirm)
    List<CashPaymentRequest> findByAssignedWorkerIdAndStatusInOrderByAssignedAtAsc(UUID workerId, List<CashRequestStatus> statuses);

    // Member view: their own requests
    List<CashPaymentRequest> findByMemberIdOrderByRequestedAtDesc(UUID memberId);

    // Admin view: full history for a specific worker (all statuses, newest first)
    List<CashPaymentRequest> findByAssignedWorkerIdOrderByRequestedAtDesc(UUID workerId);

    // Worker view: their own history — COLLECTED and CANCELLED (not ASSIGNED — those are active)
    List<CashPaymentRequest> findByAssignedWorkerIdAndStatusInOrderByUpdatedAtDesc(UUID workerId, List<CashRequestStatus> statuses);
}
