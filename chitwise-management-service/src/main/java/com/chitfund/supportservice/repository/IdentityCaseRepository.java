package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.IdentityCase;
import com.chitfund.supportservice.domain.enums.IdentityCaseStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface IdentityCaseRepository extends JpaRepository<IdentityCase, String> {
    Optional<IdentityCase> findByTicketId(String ticketId);
    Page<IdentityCase> findAllByStatusOrderByUpdatedAtDesc(IdentityCaseStatus status, Pageable pageable);
    Page<IdentityCase> findAllByOrderByUpdatedAtDesc(Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from IdentityCase c where c.id = :id")
    Optional<IdentityCase> findByIdForUpdate(@Param("id") String id);
}
