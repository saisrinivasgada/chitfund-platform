package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.AccountSetupToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AccountSetupTokenRepository extends JpaRepository<AccountSetupToken, UUID> {

    Optional<AccountSetupToken> findByTokenHash(String tokenHash);

    // Latest unused token for this user (for resend)
    Optional<AccountSetupToken> findTopByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(UUID userId);
}
