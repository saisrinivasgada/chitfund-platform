package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.AccountSetupToken;
import com.chitfund.userservice.domain.enums.SetupTokenPurpose;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface AccountSetupTokenRepository extends JpaRepository<AccountSetupToken, UUID> {

    Optional<AccountSetupToken> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM AccountSetupToken t WHERE t.tokenHash = :hash")
    Optional<AccountSetupToken> findByTokenHashForUpdate(@Param("hash") String hash);

    // Latest unused token for this user (for resend) — used by TenantService
    Optional<AccountSetupToken> findTopByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(UUID userId);

    List<AccountSetupToken> findAllByChitfundRequestIdAndUsedAtIsNull(UUID chitfundRequestId);

    // All active (unused, unexpired) tokens for a user+purpose — for concurrent revocation
    List<AccountSetupToken> findAllByUserIdAndPurposeAndUsedAtIsNull(UUID userId, SetupTokenPurpose purpose);
}
