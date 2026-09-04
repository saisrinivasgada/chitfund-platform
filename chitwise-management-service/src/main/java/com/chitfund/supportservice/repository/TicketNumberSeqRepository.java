package com.chitfund.supportservice.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.chitfund.supportservice.domain.entity.TicketNumberSeq;

import java.util.Optional;

public interface TicketNumberSeqRepository extends JpaRepository<TicketNumberSeq, Integer> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM TicketNumberSeq s WHERE s.year = :year")
    Optional<TicketNumberSeq> findByYearForUpdate(@Param("year") int year);

    @Modifying
    @Query("UPDATE TicketNumberSeq s SET s.lastVal = s.lastVal + 1 WHERE s.year = :year")
    int incrementByYear(@Param("year") int year);
}
