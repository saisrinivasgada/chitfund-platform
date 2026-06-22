package com.chitfund.payoutservice.repository;

import com.chitfund.payoutservice.domain.PayoutDisbursement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PayoutDisbursementRepository extends JpaRepository<PayoutDisbursement, UUID> {

    List<PayoutDisbursement> findByPayoutIdOrderByDisbursedAtAsc(UUID payoutId);
}
