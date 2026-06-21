package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.ChitMonthDraw;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChitMonthDrawRepository extends JpaRepository<ChitMonthDraw, UUID> {

    boolean existsByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    long countByChitIdAndStatusNot(UUID chitId, DrawStatus status);

    Optional<ChitMonthDraw> findByChitIdAndMonthNumber(UUID chitId, int monthNumber);

    List<ChitMonthDraw> findByStatusOrderByDueDateAsc(DrawStatus status);

    List<ChitMonthDraw> findByChitIdOrderByMonthNumberAsc(UUID chitId);

    @Query("SELECT c.chitId, MAX(c.monthNumber) FROM ChitMonthDraw c WHERE c.chitId IN :chitIds GROUP BY c.chitId")
    List<Object[]> findMaxMonthNumberByChitIds(@Param("chitIds") List<UUID> chitIds);

    // Today's draws: opened, closed, or created today
    @Query("SELECT d FROM ChitMonthDraw d WHERE " +
           "(d.openedAt >= :start AND d.openedAt < :end) OR " +
           "(d.closedAt >= :start AND d.closedAt < :end) OR " +
           "(d.skippedAt >= :start AND d.skippedAt < :end) " +
           "ORDER BY COALESCE(d.openedAt, d.closedAt, d.skippedAt) DESC")
    List<ChitMonthDraw> findTodaysDraws(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
