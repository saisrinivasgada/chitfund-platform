package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentRecordRepository extends JpaRepository<PaymentRecord, UUID> {

    // FIFO query — oldest month first, only OUTSTANDING or PARTIALLY_PAID
    List<PaymentRecord> findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
            UUID memberId, UUID chitId, List<PaymentRecordStatus> statuses);

    // All records for a member in a chit — includes SETTLED and WAIVED
    List<PaymentRecord> findByMemberIdAndChitIdOrderByMonthNumberAsc(UUID memberId, UUID chitId);

    // All records for a given cycle (used in dashboard stats)
    List<PaymentRecord> findByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    // Single record lookup for mark/revert payout-deducted operations
    Optional<PaymentRecord> findByChitIdAndMemberIdAndMonthNumber(UUID chitId, UUID memberId, int monthNumber);

    // All records withheld by a specific payout — used to revert across chits in one call
    List<PaymentRecord> findBySettledByPayoutId(UUID settledByPayoutId);

    void deleteByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    // Total outstanding across all chits for a single member
    @Query("SELECT COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.memberId = :memberId AND r.status IN :statuses")
    BigDecimal findTotalOutstandingByMemberId(@Param("memberId") UUID memberId, @Param("statuses") List<PaymentRecordStatus> statuses);

    // Bulk: outstanding per member, for a list of memberIds — returns [memberId, total] pairs
    @Query("SELECT r.memberId, COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.memberId IN :memberIds AND r.status IN :statuses GROUP BY r.memberId")
    List<Object[]> findTotalOutstandingByMemberIds(@Param("memberIds") List<UUID> memberIds, @Param("statuses") List<PaymentRecordStatus> statuses);
}
