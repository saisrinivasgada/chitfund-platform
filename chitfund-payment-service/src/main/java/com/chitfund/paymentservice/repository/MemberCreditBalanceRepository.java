package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.MemberCreditBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

public interface MemberCreditBalanceRepository extends JpaRepository<MemberCreditBalance, UUID> {
    Optional<MemberCreditBalance> findByMemberId(UUID memberId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM MemberCreditBalance c WHERE c.memberId = :memberId")
    Optional<MemberCreditBalance> findByMemberIdForUpdate(@Param("memberId") UUID memberId);

    // Native scalar query: reads balance directly from DB, bypassing Hibernate's L1 entity cache.
    // Used by getBalanceForUpdate to guarantee the locked read reflects any writes that were
    // flushed earlier in the same transaction (e.g. a credit restoration from supersession).
    @Query(value = "SELECT balance FROM member_credit_balance WHERE member_id = :memberId FOR UPDATE",
           nativeQuery = true)
    Optional<BigDecimal> findBalanceByMemberIdForUpdate(@Param("memberId") String memberId);
}
