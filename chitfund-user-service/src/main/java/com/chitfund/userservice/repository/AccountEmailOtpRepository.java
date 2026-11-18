package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.AccountEmailOtp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface AccountEmailOtpRepository extends JpaRepository<AccountEmailOtp, String> {
    Optional<AccountEmailOtp> findFirstByUserIdAndEmailAndPurposeAndVerifiedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
            String userId, String email, String purpose, LocalDateTime now);

    long countByUserIdAndPurposeAndCreatedAtAfter(String userId, String purpose, LocalDateTime since);

    // Direct UPDATE avoids re-fetching the entity in the outer transaction's REPEATABLE READ
    // snapshot, which would overwrite the attempts count committed by the REQUIRES_NEW inner tx.
    @Modifying
    @Query("UPDATE AccountEmailOtp otp SET otp.verified = true WHERE otp.id = :id")
    void markVerifiedById(@Param("id") String id);
}
