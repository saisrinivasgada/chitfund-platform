package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubRefreshSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.Optional;

public interface HubRefreshSessionRepository extends JpaRepository<HubRefreshSession, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM HubRefreshSession s WHERE s.tokenHash = :hash")
    Optional<HubRefreshSession> findByTokenHashForUpdate(@Param("hash") String hash);

    @Modifying
    @Query("UPDATE HubRefreshSession s SET s.revokedAt = :now WHERE s.employeeId = :employeeId AND s.revokedAt IS NULL")
    void revokeAllForEmployee(@Param("employeeId") String employeeId, @Param("now") Instant now);
}

