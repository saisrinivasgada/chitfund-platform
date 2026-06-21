package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.RefreshToken;
import com.chitfund.userservice.domain.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByToken(String token);

    /**
     * WHY @Modifying + @Transactional on this method?
     * @Modifying tells Spring Data this is a DML statement (UPDATE/DELETE), not a SELECT.
     * Without it, the JPQL UPDATE would fail at runtime.
     * @Transactional here is a safety net for callers that don't have an outer transaction.
     * In practice AuthService is already @Transactional, so this propagates.
     *
     * WHY JPQL UPDATE instead of findAll + setRevoked + saveAll?
     * One SQL UPDATE vs N individual UPDATEs. For a user with many devices logged in,
     * this is significantly faster. Always prefer set-based operations over row-by-row.
     */
    @Modifying
    @Transactional
    @Query("UPDATE RefreshToken rt SET rt.revoked = true WHERE rt.user = :user AND rt.revoked = false")
    void revokeAllActiveByUser(User user);
}
