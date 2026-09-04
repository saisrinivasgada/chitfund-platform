package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRecordRepository extends JpaRepository<PaymentRecord, UUID> {

    Optional<PaymentRecord> findByIdAndTenantId(UUID id, String tenantId);

    // FIFO query — oldest month first, only OUTSTANDING or PARTIALLY_PAID
    List<PaymentRecord> findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
            UUID memberId, UUID chitId, List<PaymentRecordStatus> statuses);

    // Locked FIFO queries — acquire row-level write locks before applying FIFO allocation
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.memberId = :memberId AND r.chitId = :chitId AND r.status IN :statuses ORDER BY r.monthNumber ASC")
    List<PaymentRecord> findByMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
            @Param("memberId") UUID memberId,
            @Param("chitId") UUID chitId,
            @Param("statuses") List<PaymentRecordStatus> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.memberId = :memberId AND r.chitId <> :excludeChitId AND r.status IN :statuses ORDER BY r.dueDate ASC, r.monthNumber ASC")
    List<PaymentRecord> findOutstandingAcrossOtherChitsForUpdate(
            @Param("memberId") UUID memberId,
            @Param("excludeChitId") UUID excludeChitId,
            @Param("statuses") List<PaymentRecordStatus> statuses);

    // All records for a member in a chit — includes SETTLED and WAIVED
    List<PaymentRecord> findByMemberIdAndChitIdOrderByMonthNumberAsc(UUID memberId, UUID chitId);

    // All records for a given cycle (used in dashboard stats)
    List<PaymentRecord> findByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    // Single record lookup for mark/revert payout-deducted operations
    Optional<PaymentRecord> findByChitIdAndMemberIdAndMonthNumber(UUID chitId, UUID memberId, int monthNumber);

    // All records withheld by a specific payout — used to revert across chits in one call
    List<PaymentRecord> findBySettledByPayoutId(UUID settledByPayoutId);

    // All SETTLEMENT_CLEARED records for a member — used when voiding a settlement
    List<PaymentRecord> findByTenantIdAndMemberIdAndStatusIn(
            String tenantId, UUID memberId, List<PaymentRecordStatus> statuses);

    // Used to verify enrollment before accepting payment from admin-held slot holders (non-member UUIDs)
    boolean existsByMemberIdAndChitId(UUID memberId, UUID chitId);

    void deleteByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    // Cross-chit FIFO: all outstanding records for a member across every chit EXCEPT the one being paid.
    // Ordered by dueDate so the oldest debt across all chits clears first.
    @Query("SELECT r FROM PaymentRecord r WHERE r.memberId = :memberId AND r.chitId <> :excludeChitId AND r.status IN :statuses ORDER BY r.dueDate ASC, r.monthNumber ASC")
    List<PaymentRecord> findOutstandingAcrossOtherChits(
            @Param("memberId") UUID memberId,
            @Param("excludeChitId") UUID excludeChitId,
            @Param("statuses") List<PaymentRecordStatus> statuses);

    // Total outstanding across all chits for a single member
    @Query("SELECT COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.memberId = :memberId AND r.status IN :statuses")
    BigDecimal findTotalOutstandingByMemberId(@Param("memberId") UUID memberId, @Param("statuses") List<PaymentRecordStatus> statuses);

    // Bulk: outstanding per member, for a list of memberIds — returns [memberId, total] pairs
    @Query("SELECT r.memberId, COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.memberId IN :memberIds AND r.status IN :statuses GROUP BY r.memberId")
    List<Object[]> findTotalOutstandingByMemberIds(@Param("memberIds") List<UUID> memberIds, @Param("statuses") List<PaymentRecordStatus> statuses);

    // Chit-level outstanding summary: total amount owed + distinct member count with dues
    @Query("SELECT COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.chitId = :chitId AND r.status IN :statuses")
    BigDecimal findTotalOutstandingByChitId(@Param("chitId") UUID chitId, @Param("statuses") List<PaymentRecordStatus> statuses);

    @Query("SELECT COUNT(DISTINCT r.memberId) FROM PaymentRecord r WHERE r.chitId = :chitId AND r.status IN :statuses AND (r.amountDue - r.amountPaid) > 0")
    long countDistinctMembersWithOutstandingByChitId(@Param("chitId") UUID chitId, @Param("statuses") List<PaymentRecordStatus> statuses);
}
