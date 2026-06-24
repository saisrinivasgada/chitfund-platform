package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.Settlement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    // All settlements for a member, newest first
    List<Settlement> findByMemberIdOrderBySettledAtDesc(UUID memberId);
}
