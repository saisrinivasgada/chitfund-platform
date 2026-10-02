package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.MemberCreditBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface MemberCreditBalanceRepository extends JpaRepository<MemberCreditBalance, UUID> {
    Optional<MemberCreditBalance> findByMemberId(UUID memberId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM MemberCreditBalance c WHERE c.memberId = :memberId")
    Optional<MemberCreditBalance> findByMemberIdForUpdate(@Param("memberId") UUID memberId);
}
