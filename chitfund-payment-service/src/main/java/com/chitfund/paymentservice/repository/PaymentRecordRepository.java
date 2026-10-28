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

    List<PaymentRecord> findByTenantIdAndMemberIdAndStatusInOrderById(
            String tenantId, UUID memberId, List<PaymentRecordStatus> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.tenantId=:tenantId AND r.memberId=:memberId AND r.status IN :statuses ORDER BY r.id")
    List<PaymentRecord> findMemberOutstandingForUpdate(@Param("tenantId") String tenantId,
            @Param("memberId") UUID memberId, @Param("statuses") List<PaymentRecordStatus> statuses);

    Optional<PaymentRecord> findByIdAndTenantId(UUID id, String tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.id=:id AND r.tenantId=:tenantId")
    Optional<PaymentRecord> findByIdAndTenantIdForUpdate(@Param("id") UUID id, @Param("tenantId") String tenantId);


    List<PaymentRecord> findByTenantIdAndMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
            String tenantId, UUID memberId, UUID chitId, List<PaymentRecordStatus> statuses);

    // Locked FIFO queries — acquire row-level write locks before applying FIFO allocation
    // All records for a member in a chit — includes SETTLED and WAIVED
    List<PaymentRecord> findByTenantIdAndMemberIdAndChitIdOrderByMonthNumberAsc(
            String tenantId, UUID memberId, UUID chitId);

    // All records for a given cycle (used in dashboard stats)
    List<PaymentRecord> findByTenantIdAndChitIdAndMonthNumber(
            String tenantId, UUID chitId, int monthNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.tenantId=:tenantId AND r.chitId=:chitId "
            + "AND r.memberId=:memberId AND r.monthNumber=:monthNumber")
    Optional<PaymentRecord> findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(
            @Param("tenantId") String tenantId, @Param("chitId") UUID chitId,
            @Param("memberId") UUID memberId, @Param("monthNumber") int monthNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.tenantId=:tenantId "
            + "AND r.settledByPayoutId=:settledByPayoutId ORDER BY r.id")
    List<PaymentRecord> findByTenantIdAndSettledByPayoutIdForUpdate(
            @Param("tenantId") String tenantId,
            @Param("settledByPayoutId") UUID settledByPayoutId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.tenantId=:tenantId AND r.memberId=:memberId "
            + "AND r.chitId=:chitId AND r.status IN :statuses "
            + "ORDER BY r.monthNumber ASC")
    List<PaymentRecord> findByTenantIdAndMemberIdAndChitIdAndStatusInForUpdateOrderByMonthNumberAsc(
            @Param("tenantId") String tenantId, @Param("memberId") UUID memberId,
            @Param("chitId") UUID chitId,
            @Param("statuses") List<PaymentRecordStatus> statuses);

    // All SETTLEMENT_CLEARED records for a member — used when voiding a settlement
    List<PaymentRecord> findByTenantIdAndMemberIdAndStatusIn(
            String tenantId, UUID memberId, List<PaymentRecordStatus> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.tenantId = :tenantId AND r.id IN :ids ORDER BY r.id")
    List<PaymentRecord> findAllByTenantIdAndIdInForUpdate(
            @Param("tenantId") String tenantId,
            @Param("ids") List<UUID> ids);

    // Used to verify enrollment before accepting payment from admin-held slot holders (non-member UUIDs)
    boolean existsByTenantIdAndMemberIdAndChitId(String tenantId, UUID memberId, UUID chitId);

    void deleteByTenantIdAndChitIdAndMonthNumber(String tenantId, UUID chitId, int monthNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PaymentRecord r WHERE r.tenantId = :tenantId AND r.memberId = :memberId "
            + "AND r.chitId <> :excludeChitId AND r.status IN :statuses ORDER BY r.dueDate ASC, r.monthNumber ASC")
    List<PaymentRecord> findOutstandingAcrossOtherChitsForUpdateByTenant(
            @Param("tenantId") String tenantId,
            @Param("memberId") UUID memberId,
            @Param("excludeChitId") UUID excludeChitId,
            @Param("statuses") List<PaymentRecordStatus> statuses);

    @Query("SELECT COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.tenantId = :tenantId AND r.memberId = :memberId AND r.status IN :statuses")
    BigDecimal findTotalOutstandingByTenantIdAndMemberId(@Param("tenantId") String tenantId,
            @Param("memberId") UUID memberId, @Param("statuses") List<PaymentRecordStatus> statuses);

    @Query("SELECT r.memberId, COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.tenantId = :tenantId AND r.memberId IN :memberIds AND r.status IN :statuses GROUP BY r.memberId")
    List<Object[]> findTotalOutstandingByTenantIdAndMemberIds(@Param("tenantId") String tenantId,
            @Param("memberIds") List<UUID> memberIds, @Param("statuses") List<PaymentRecordStatus> statuses);

    @Query("SELECT COALESCE(SUM(r.amountDue - r.amountPaid), 0) FROM PaymentRecord r WHERE r.tenantId = :tenantId AND r.chitId = :chitId AND r.status IN :statuses")
    BigDecimal findTotalOutstandingByTenantIdAndChitId(@Param("tenantId") String tenantId,
            @Param("chitId") UUID chitId, @Param("statuses") List<PaymentRecordStatus> statuses);

    @Query("SELECT COUNT(DISTINCT r.memberId) FROM PaymentRecord r WHERE r.tenantId = :tenantId AND r.chitId = :chitId AND r.status IN :statuses AND (r.amountDue - r.amountPaid) > 0")
    long countDistinctMembersWithOutstandingByTenantIdAndChitId(@Param("tenantId") String tenantId,
            @Param("chitId") UUID chitId, @Param("statuses") List<PaymentRecordStatus> statuses);
}
