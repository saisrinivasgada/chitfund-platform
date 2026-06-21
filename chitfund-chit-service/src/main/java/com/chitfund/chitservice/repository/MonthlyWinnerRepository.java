package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.MonthlyWinner;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MonthlyWinnerRepository extends JpaRepository<MonthlyWinner, UUID> {

    List<MonthlyWinner> findByChitIdOrderByMonthNumberAsc(UUID chitId);

    Optional<MonthlyWinner> findByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    boolean existsByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    // Members who have already won — used to exclude from lottery draws
    @Query("SELECT w.memberId FROM MonthlyWinner w WHERE w.chit.id = :chitId")
    List<UUID> findWinnerMemberIdsByChitId(UUID chitId);

    long countByChitId(UUID chitId);

    void deleteByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);
}
