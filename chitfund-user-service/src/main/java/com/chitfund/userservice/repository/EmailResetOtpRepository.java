package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.EmailResetOtp;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface EmailResetOtpRepository extends JpaRepository<EmailResetOtp, String> {

    long countByUserIdAndCreatedAtAfter(String userId, LocalDateTime after);

    Optional<EmailResetOtp> findFirstByUserIdAndUsedFalseAndExpiresAtAfterOrderByCreatedAtDesc(
            String userId, LocalDateTime now);
}
