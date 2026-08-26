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

    boolean existsByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    // Members who have already won — used to exclude from lottery draws
    @Query("SELECT w.memberId FROM MonthlyWinner w WHERE w.chit.id = :chitId")
    List<UUID> findWinnerMemberIdsByChitId(UUID chitId);

    long countByChitId(UUID chitId);

    // Batch winner counts for a list of chits — avoids N+1 in list views
    @Query("SELECT w.chit.id AS chitId, COUNT(w) AS cnt FROM MonthlyWinner w WHERE w.chit.id IN :chitIds GROUP BY w.chit.id")
    List<Map<String, Object>> countByChitIds(@Param("chitIds") List<UUID> chitIds);

    void deleteByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);
}
