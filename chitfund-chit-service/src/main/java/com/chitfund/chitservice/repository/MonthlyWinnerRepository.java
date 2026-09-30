package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.MonthlyWinner;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface MonthlyWinnerRepository extends JpaRepository<MonthlyWinner, UUID> {

    List<MonthlyWinner> findByChitIdOrderByMonthNumberAsc(UUID chitId);

    List<MonthlyWinner> findByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    @Query("SELECT w FROM MonthlyWinner w WHERE w.chit.id = :chitId " +
            "AND w.chit.tenantId = :tenantId AND w.monthNumber = :monthNumber " +
            "AND w.memberId = :memberId ORDER BY w.assignedAt ASC")
    List<MonthlyWinner> findForPayoutValidation(
            @Param("chitId") UUID chitId,
            @Param("monthNumber") Integer monthNumber,
            @Param("memberId") UUID memberId,
            @Param("tenantId") String tenantId);

    boolean existsByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    @Query("SELECT COUNT(w) FROM MonthlyWinner w WHERE w.chit.id = :chitId " +
            "AND w.chit.tenantId = :tenantId AND w.monthNumber = :monthNumber")
    long countByChitIdAndMonthNumberAndTenantId(@Param("chitId") UUID chitId,
                                                @Param("monthNumber") Integer monthNumber,
                                                @Param("tenantId") String tenantId);

    // Exact-duplicate guard: the same member can legitimately win different months
    // (multi-spot), and different members can legitimately both win the same month
    // (intentional — see V8/V9 migrations), but the same member winning the same
    // month twice is never legitimate — it's always a double-submit/retry.
    boolean existsByChitIdAndMonthNumberAndMemberId(UUID chitId, Integer monthNumber, UUID memberId);

    // Members who have already won — used to exclude from lottery draws
    @Query("SELECT w.memberId FROM MonthlyWinner w WHERE w.chit.id = :chitId")
    List<UUID> findWinnerMemberIdsByChitId(UUID chitId);

    @Query("SELECT w.memberId FROM MonthlyWinner w WHERE w.chit.id = :chitId AND w.chit.tenantId = :tenantId")
    List<UUID> findWinnerMemberIdsByChitIdAndTenantId(@Param("chitId") UUID chitId,
                                                      @Param("tenantId") String tenantId);

    long countByChitId(UUID chitId);

    // Batch winner counts for a list of chits — avoids N+1 in list views
    @Query("SELECT w.chit.id AS chitId, COUNT(w) AS cnt FROM MonthlyWinner w WHERE w.chit.id IN :chitIds GROUP BY w.chit.id")
    List<Map<String, Object>> countByChitIds(@Param("chitIds") List<UUID> chitIds);

    void deleteByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);
}
