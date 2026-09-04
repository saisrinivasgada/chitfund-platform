package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MonthReservationRepository extends JpaRepository<MonthReservation, UUID> {

    // All slots for a chit, ordered by calendar month
    List<MonthReservation> findByChitIdOrderByReservationMonthAscMonthNumberAsc(UUID chitId);

    // All slots for a specific calendar month (multiple payouts in same month)
    List<MonthReservation> findByChitIdAndReservationMonth(UUID chitId, LocalDate reservationMonth);

    // All slots assigned to a specific member within a chit
    List<MonthReservation> findByChitIdAndMemberId(UUID chitId, UUID memberId);

    // Legacy: look up by ordinal month number
    List<MonthReservation> findByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    boolean existsByChitIdAndMemberIdAndStatusNot(UUID chitId, UUID memberId, ReservationStatus status);

    long countByChitIdAndStatus(UUID chitId, ReservationStatus status);

    long countByChitIdAndStatusNot(UUID chitId, ReservationStatus status);

    long countByChitIdAndOrgHeldTrueAndStatusNot(UUID chitId, ReservationStatus status);

    // Max ordinal across ALL slots (including voided) — used to assign the next slot number
    @Query("SELECT MAX(r.monthNumber) FROM MonthReservation r WHERE r.chit.id = :chitId")
    Optional<Integer> findMaxMonthNumberByChitId(@Param("chitId") UUID chitId);

    // All future (not yet processed/voided) slots from a given ordinal onward — used to shift after a skip
    @Query("SELECT r FROM MonthReservation r WHERE r.chit.id = :chitId AND r.monthNumber >= :fromMonth AND r.status IN :statuses ORDER BY r.monthNumber ASC")
    List<MonthReservation> findShiftableFromMonth(@Param("chitId") UUID chitId, @Param("fromMonth") int fromMonth, @Param("statuses") List<ReservationStatus> statuses);

    // All org-held slots across all chits (excludes VOIDED)
    @Query("SELECT r FROM MonthReservation r JOIN FETCH r.chit WHERE r.orgHeld = true AND r.status != com.chitfund.chitservice.domain.enums.ReservationStatus.VOIDED ORDER BY r.reservationMonth ASC")
    List<MonthReservation> findAllOrgHeld();
}
