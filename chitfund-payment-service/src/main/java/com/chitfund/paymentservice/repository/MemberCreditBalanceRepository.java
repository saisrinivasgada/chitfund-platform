package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.MemberCreditBalance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface MemberCreditBalanceRepository extends JpaRepository<MemberCreditBalance, UUID> {
    Optional<MemberCreditBalance> findByMemberId(UUID memberId);
}
