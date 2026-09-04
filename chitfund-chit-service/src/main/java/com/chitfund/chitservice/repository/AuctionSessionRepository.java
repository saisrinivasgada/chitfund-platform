package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.AuctionSession;
import com.chitfund.chitservice.domain.enums.AuctionMode;
import com.chitfund.chitservice.domain.enums.AuctionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuctionSessionRepository extends JpaRepository<AuctionSession, UUID> {

    Optional<AuctionSession> findByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    Optional<AuctionSession> findByIdAndChitIdAndTenantId(UUID id, UUID chitId, String tenantId);

    Optional<AuctionSession> findByIdAndTenantId(UUID id, String tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM AuctionSession a WHERE a.id = :id AND a.chitId = :chitId AND a.tenantId = :tenantId")
    Optional<AuctionSession> findByIdAndChitIdAndTenantIdForUpdate(
            @Param("id") UUID id,
            @Param("chitId") UUID chitId,
            @Param("tenantId") String tenantId);

    List<AuctionSession> findByChitIdAndTenantIdOrderByMonthNumberAsc(UUID chitId, String tenantId);

    boolean existsByChitIdAndMonthNumberAndStatus(UUID chitId, Integer monthNumber, AuctionStatus status);

    List<AuctionSession> findByStatusAndAuctionModeAndClosesAtBefore(
            AuctionStatus status, AuctionMode mode, LocalDateTime cutoff);
}
