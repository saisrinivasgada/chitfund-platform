package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.Settlement;
import com.chitfund.paymentservice.domain.enums.SettlementPaymentStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    // All settlements for a member, newest first
    List<Settlement> findByMemberIdOrderBySettledAtDesc(UUID memberId);

    // True if the member has any settlement not in the given terminal statuses (i.e. still active)
    boolean existsByMemberIdAndPaymentStatusNotIn(UUID memberId, List<SettlementPaymentStatus> terminalStatuses);

    /**
     * Loads a Settlement with a database-level pessimistic write lock.
     *
     * WHY pessimistic lock here?
     * recordTransaction reads collectedAmount/disbursedAmount, adds to them, and saves.
     * Without a lock, two concurrent requests could both read the same stale value,
     * each add their amount, and one update would be lost — a classic lost-update bug.
     * Pessimistic write lock serializes concurrent updates to the same settlement row.
     *
     * INTERVIEW: "Optimistic locking (@Version) also works but causes exceptions on
     * contention that must be retried in client code. Pessimistic is simpler when
     * the locked section is very short and contention is rare (one settlement = one member)."
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Settlement s WHERE s.id = :id")
    Optional<Settlement> findByIdWithLock(@Param("id") UUID id);

    /**
     * Returns all settlements that still have outstanding payment obligations.
     *
     * WHY NOT IN rather than individual status checks?
     * We want "anything that is not complete" — expressing it as an exclusion list means
     * newly added terminal statuses automatically fall out without changing this query.
     */
    @Query("SELECT s FROM Settlement s WHERE s.paymentStatus NOT IN :terminalStatuses ORDER BY s.settledAt DESC")
    List<Settlement> findByPaymentStatusNotIn(
            @Param("terminalStatuses") List<SettlementPaymentStatus> terminalStatuses);
}

