package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.AccountEmailOtp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface AccountEmailOtpRepository extends JpaRepository<AccountEmailOtp, String> {
    Optional<AccountEmailOtp> findFirstByUserIdAndEmailAndPurposeAndVerifiedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
            String userId, String email, String purpose, LocalDateTime now);

    long countByUserIdAndPurposeAndCreatedAtAfter(String userId, String purpose, LocalDateTime since);
}
